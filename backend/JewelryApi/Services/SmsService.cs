namespace JewelryApi.Services;

// Sends an SMS through any HTTP SMS gateway. appsettings.json > "Sms":
//   UrlTemplate = "https://gateway.example/send?key={key}&to={to}&text={message}"
//   ApiKey      = "your key"
public class SmsService(IConfiguration cfg)
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(20) };

    public bool IsConfigured => !string.IsNullOrWhiteSpace(cfg["Sms:UrlTemplate"]);

    public async Task SendAsync(string to, string message)
    {
        var url = cfg["Sms:UrlTemplate"]!
            .Replace("{key}", Uri.EscapeDataString(cfg["Sms:ApiKey"] ?? ""))
            .Replace("{to}", Uri.EscapeDataString(to))
            .Replace("{message}", Uri.EscapeDataString(message));
        using var res = await Http.GetAsync(url);
        res.EnsureSuccessStatusCode();
    }
}
