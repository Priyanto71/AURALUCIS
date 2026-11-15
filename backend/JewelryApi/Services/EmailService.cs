using System.Net;
using System.Net.Mail;

namespace JewelryApi.Services;

// Sends e-mail through any SMTP server set in appsettings.json ("Email" section).
public class EmailService(IConfiguration cfg)
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(cfg["Email:Host"]);

    public async Task SendAsync(string to, string subject, string htmlBody)
    {
        var host = cfg["Email:Host"]!;
        var port = int.TryParse(cfg["Email:Port"], out var p) ? p : 587;
        var user = cfg["Email:User"];
        var password = cfg["Email:Password"];
        var from = string.IsNullOrWhiteSpace(cfg["Email:From"]) ? user : cfg["Email:From"];
        var ssl = !string.Equals(cfg["Email:EnableSsl"], "false", StringComparison.OrdinalIgnoreCase);

        using var client = new SmtpClient(host, port)
        {
            EnableSsl = ssl,
            Credentials = string.IsNullOrEmpty(user) ? null : new NetworkCredential(user, password)
        };
        using var msg = new MailMessage(from ?? "no-reply@localhost", to, subject, htmlBody) { IsBodyHtml = true };
        await client.SendMailAsync(msg);
    }
}
