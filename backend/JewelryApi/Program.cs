using Dapper;
using JewelryApi.Auth;
using JewelryApi.Data;
using JewelryApi.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.OpenApi.Models;
using Oracle.ManagedDataAccess.Client;

var builder = WebApplication.CreateBuilder(args);

// Oracle columns look like PRODUCT_NAME; this lets Dapper fill a C# property called ProductName.
DefaultTypeMap.MatchNamesWithUnderscores = true;

builder.Services.AddSingleton<DbConnectionFactory>();
builder.Services.AddSingleton<TokenStore>();
builder.Services.AddSingleton<SettingsService>();
builder.Services.AddSingleton<ReceiptService>();
builder.Services.AddSingleton<EmailService>();
builder.Services.AddSingleton<SmsService>();
builder.Services.AddControllers();

// Login: every endpoint needs a valid token unless marked [AllowAnonymous] (only /api/auth/login).
builder.Services.AddAuthentication("Token")
    .AddScheme<AuthenticationSchemeOptions, TokenAuthHandler>("Token", null);
builder.Services.AddAuthorization(o =>
    o.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "AURALUCIS API",
        Version = "v1",
        Description = "Where Luxury Meets Precision. Jewelry Shop & Stock Management System."
    });
    // Adds the "Authorize" button in Swagger: paste the token returned by POST /api/Auth/login
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        In = ParameterLocation.Header,
        Description = "Paste the token from /api/Auth/login"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// Turn Oracle errors (constraints, RAISE_APPLICATION_ERROR) into clean HTTP responses.
app.UseExceptionHandler(a => a.Run(async ctx =>
{
    var ex = ctx.Features.Get<IExceptionHandlerFeature>()?.Error;
    var (status, msg) = ex switch
    {
        OracleException o when o.Number is 20001 or 20002 or 20006 or 20007 or 20008 or 20009 or 20010 or 20011 or 20013 or 20014 or 20015 or 20016 or 20017 or 20018 or 20019 => (400, AppMessage(o)),
        OracleException o when o.Number == 20003          => (404, AppMessage(o)),
        OracleException o when o.Number is 20004 or 20005 or 20012 => (409, AppMessage(o)),
        OracleException o when o.Number == 1403           => (404, "Record not found."),
        OracleException o when o.Number == 1              => (409, "Duplicate value (unique constraint)."),
        OracleException o when o.Number == 2292           => (409, "Cannot delete: this record is used elsewhere."),
        OracleException o when o.Number == 2291           => (400, "Referenced record does not exist."),
        OracleException o when o.Number == 2290           => (400, "Value breaks a check rule (e.g. negative stock)."),
        _ => (500, "Server error.")
    };
    ctx.Response.StatusCode = status;
    await ctx.Response.WriteAsJsonAsync(new { error = msg });
}));

app.UseSwagger();
app.UseSwaggerUI();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Urls.Add("http://localhost:5000");
app.Run();

// "ORA-20001: Insufficient stock available." -> "Insufficient stock available."
static string AppMessage(OracleException o)
{
    var line = o.Message.Split('\n')[0];
    var i = line.IndexOf(':');
    return i >= 0 ? line[(i + 1)..].Trim() : line;
}
