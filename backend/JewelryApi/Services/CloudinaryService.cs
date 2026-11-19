using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace JewelryApi.Services;

public class CloudinaryService(IConfiguration config, IHttpClientFactory clients)
{
    public async Task<string> UploadAsync(IFormFile file, CancellationToken ct)
    {
        if (file.Length <= 0 || file.Length > 5 * 1024 * 1024) throw new InvalidOperationException("Image must be between 1 byte and 5 MB.");
        if (!new[] { "image/jpeg", "image/png", "image/webp" }.Contains(file.ContentType.ToLowerInvariant()))
            throw new InvalidOperationException("Only JPG, PNG and WEBP images are allowed.");
        var cloud = config["Cloudinary:CloudName"];
        var key = config["Cloudinary:ApiKey"];
        var secret = config["Cloudinary:ApiSecret"];
        if (string.IsNullOrWhiteSpace(cloud) || string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(secret))
            throw new InvalidOperationException("Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.");
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var folder = "auralucis/products";
        var toSign = $"folder={folder}&timestamp={timestamp}{secret}";
        var signature = Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(toSign))).ToLowerInvariant();
        using var form = new MultipartFormDataContent();
        await using var stream = file.OpenReadStream();
        using var content = new StreamContent(stream);
        content.Headers.ContentType = new MediaTypeHeaderValue(file.ContentType);
        form.Add(content, "file", Path.GetFileName(file.FileName));
        form.Add(new StringContent(key), "api_key"); form.Add(new StringContent(timestamp), "timestamp");
        form.Add(new StringContent(folder), "folder"); form.Add(new StringContent(signature), "signature");
        var response = await clients.CreateClient().PostAsync($"https://api.cloudinary.com/v1_1/{cloud}/image/upload", form, ct);
        var json = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException("Cloudinary upload failed. Check the Cloudinary configuration.");
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.GetProperty("secure_url").GetString()!;
    }
}
