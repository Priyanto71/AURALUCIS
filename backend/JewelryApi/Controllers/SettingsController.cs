using System.Globalization;
using JewelryApi.Auth;
using JewelryApi.Data;
using JewelryApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SettingsController(SettingsService settings, DbConnectionFactory db) : ControllerBase
{
    // Any logged-in employee (the sale screen needs the VAT % and the shop name).
    [HttpGet]
    public async Task<IActionResult> Get() => Ok(await settings.GetAllAsync());

    // Manager only: shop name, address, phone, VAT %, website link used in the receipt QR code.
    [HttpPut]
    [Authorize(Roles = "Manager,Owner")]
    public async Task<IActionResult> Save(Dictionary<string, string> values)
    {
        foreach (var (key, raw) in values)
        {
            if (!SettingsService.Keys.Contains(key))
                return BadRequest(new { error = $"Unknown setting '{key}'." });

            var v = (raw ?? "").Trim();
            if (v.Length > 300) return BadRequest(new { error = $"'{key}' is too long." });

            if (key == "vat_percent")
            {
                if (!decimal.TryParse(v, NumberStyles.Number, CultureInfo.InvariantCulture, out var vat) || vat < 0 || vat > 100)
                    return BadRequest(new { error = "VAT must be a number between 0 and 100." });
            }
            if (key == "website_url" && !(v.StartsWith("http://") || v.StartsWith("https://")))
                return BadRequest(new { error = "The website link must start with http:// or https://" });
            if (key == "shop_name" && v.Length == 0)
                return BadRequest(new { error = "The shop name cannot be empty." });
        }

        foreach (var (key, raw) in values)
            await settings.SaveAsync(key, (raw ?? "").Trim());

        await AuditLogger.LogAsync(db, User.GetEmployeeId(), "UPDATE", "Settings", null,
            string.Join("; ", values.Select(kv => $"{kv.Key} = {kv.Value}")));
        return NoContent();
    }
}
