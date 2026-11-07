using AspNetCore.Proxy;
using Microsoft.AspNetCore.DataProtection;
using MusicParty;
using MusicParty.Hub;
using MusicParty.MusicApi;
using MusicParty.MusicApi.Bilibili;
using MusicParty.MusicApi.NeteaseCloudMusic;
using MusicParty.MusicApi.QQMusic;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSignalR();

var dataPath = builder.Configuration["DataPath"] ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MusicParty");
var keyPath = Path.Combine(dataPath, "keys");
Directory.CreateDirectory(keyPath);
var dataProtection = builder.Services.AddDataProtection()
    .SetApplicationName("MusicParty")
    .PersistKeysToFileSystem(new DirectoryInfo(keyPath));
if (OperatingSystem.IsWindows()) dataProtection.ProtectKeysWithDpapi();

// Add music api
var musicApiList = new List<IMusicApi>();
if (bool.Parse(builder.Configuration["MusicApi:NeteaseCloudMusic:Enabled"]))
{
    var api = new NeteaseCloudMusicApi(
        builder.Configuration["MusicApi:NeteaseCloudMusic:ApiServerUrl"],
        builder.Configuration["MusicApi:NeteaseCloudMusic:PhoneNo"],
        builder.Configuration["MusicApi:NeteaseCloudMusic:Cookie"],
        builder.Configuration["MusicApi:NeteaseCloudMusic:Password"]
    );
    api.Login();
    musicApiList.Add(api);
}

if (bool.Parse(builder.Configuration["MusicApi:QQMusic:Enabled"]))
{
    var api = new QQMusicApi(
        builder.Configuration["MusicApi:QQMusic:ApiServerUrl"],
        builder.Configuration["MusicApi:QQMusic:Cookie"]
    );
    musicApiList.Add(api);
}

if (bool.Parse(builder.Configuration["MusicApi:Bilibili:Enabled"]))
{
    var api = new BilibiliApi(
        builder.Configuration["MusicApi:Bilibili:SESSDATA"],
        builder.Configuration["MusicApi:Bilibili:PhoneNo"]
    );
    api.Login();
    musicApiList.Add(api);
}

// Add more music api provider in the future.
if (musicApiList.Count == 0)
    throw new Exception("Cannot start without any music api service.");

builder.Services.AddSingleton<IEnumerable<IMusicApi>>(musicApiList);
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<UserManager>();
builder.Services.AddAuthentication("Cookies").AddCookie("Cookies");
builder.Services.AddProxies();
builder.Services.AddSingleton<MusicBroadcaster>();
builder.Services.AddSingleton<RoomTimeline>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseRouting();

app.UseAuthentication();

app.UsePreprocess();

app.UseAuthorization();

app.UseEndpoints(endpoints =>
{
    endpoints.MapControllers();
    endpoints.MapHub<MusicHub>("/music");
});

app.UseMusicProxy();

// Proxy the front end server.
app.RunHttpProxy(builder.Configuration["FrontEndUrl"]);

app.Run();
