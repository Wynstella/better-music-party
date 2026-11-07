using System.Security.Claims;
using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.DataProtection;

namespace MusicParty;

public class UserManager
{
    private readonly IHttpContextAccessor _accessor;
    private readonly IDataProtector _protector;
    private readonly ILogger<UserManager> _logger;
    private readonly string _statePath;
    private readonly object _stateLock = new();
    private readonly ConcurrentDictionary<string, User> _users = new();
    private readonly ConcurrentDictionary<(string UserId, string Service), string> _musicApiCredentials = new();

    public UserManager(IHttpContextAccessor accessor, IDataProtectionProvider protectionProvider, ILogger<UserManager> logger, IConfiguration configuration)
    {
        _accessor = accessor;
        _protector = protectionProvider.CreateProtector("MusicParty.UserState.v1");
        _logger = logger;
        var dataPath = configuration["DataPath"] ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MusicParty");
        _statePath = Path.Combine(dataPath, "users.dat");
        LoadState();
    }

    private void CreateUser(string id, string name, Dictionary<string, string>? bindings = null)
    {
        _users[id] = new User(id, name, bindings ?? new());
        SaveState();
    }

    public void RestoreUser(string id)
    {
        _users.TryAdd(id, new User(id, id, new()));
        SaveState();
    }

    public async Task LoginAsync(string id)
    {
        var claims = new List<Claim>()
        {
            new(ClaimTypes.Name, id)
        };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "any"));
        _accessor.HttpContext!.User = user;
        await _accessor.HttpContext!.SignInAsync("Cookies", user, new AuthenticationProperties()
        {
            ExpiresUtc = DateTimeOffset.MaxValue
        });
        CreateUser(id, id);
    }

    public async Task LogoutAsync(string id)
    {
        await _accessor.HttpContext!.SignOutAsync("Cookies");
        _users.TryRemove(id, out _);
        foreach (var key in _musicApiCredentials.Keys.Where(key => key.UserId == id))
            _musicApiCredentials.TryRemove(key, out _);
        SaveState();
    }

    public User? FindUserById(string id)
    {
        return _users.TryGetValue(id, out var user) ? user : null;
    }

    public void RenameUserById(string id, string newName)
    {
        var user = FindUserById(id);
        if (user is null) throw new ArgumentException($"No user whose id is {id}.", nameof(id));
        _users[id] = user with { Name = newName };
        SaveState();
    }

    public void BindMusicApiService(string id, string apiName, string identifier)
    {
        var user = FindUserById(id);
        if (user is null) throw new ArgumentException($"No user whose id is {id}.", nameof(id));
        if (user.MusicApiServiceBindings.ContainsKey(apiName))
            user.MusicApiServiceBindings[apiName] = identifier;
        else
            user.MusicApiServiceBindings.Add(apiName, identifier);
        SaveState();
    }

    public void SetMusicApiCredential(string userId, string apiName, string credential)
    {
        _musicApiCredentials[(userId, apiName)] = credential;
        SaveState();
    }

    public bool TryGetMusicApiCredential(string userId, string apiName, out string? credential) =>
        _musicApiCredentials.TryGetValue((userId, apiName), out credential);

    private void LoadState()
    {
        try
        {
            if (!File.Exists(_statePath)) return;
            var protectedState = File.ReadAllText(_statePath);
            var state = JsonSerializer.Deserialize<PersistedState>(_protector.Unprotect(protectedState));
            if (state is null) return;
            foreach (var user in state.Users) _users[user.Id] = user;
            foreach (var credential in state.Credentials)
                _musicApiCredentials[(credential.UserId, credential.Service)] = credential.Value;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not restore saved MusicParty user state.");
        }
    }

    private void SaveState()
    {
        lock (_stateLock)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_statePath)!);
                var state = new PersistedState(
                    _users.Values.ToArray(),
                    _musicApiCredentials.Select(pair => new PersistedCredential(pair.Key.UserId, pair.Key.Service, pair.Value)).ToArray());
                var protectedState = _protector.Protect(JsonSerializer.Serialize(state));
                var temporaryPath = _statePath + ".tmp";
                File.WriteAllText(temporaryPath, protectedState);
                File.Move(temporaryPath, _statePath, true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Could not persist MusicParty user state.");
            }
        }
    }

    private sealed record PersistedState(User[] Users, PersistedCredential[] Credentials);
    private sealed record PersistedCredential(string UserId, string Service, string Value);
}
