using Dapper;
using JewelryApi.Data;
using JewelryApi.Models;

namespace JewelryApi.Services;

// Shop settings stored in the shop_settings table (VAT %, shop name, address, phone, website link).
public class SettingsService(DbConnectionFactory db)
{
    public static readonly string[] Keys = { "shop_name", "shop_tagline", "shop_address", "shop_phone", "vat_percent", "website_url" };

    public async Task<Dictionary<string, string>> GetAllAsync()
    {
        var result = new Dictionary<string, string>
        {
            ["shop_name"] = "AURALUCIS", ["shop_tagline"] = "Where Luxury Meets Precision.",
            ["shop_address"] = "", ["shop_phone"] = "", ["vat_percent"] = "0", ["website_url"] = "http://localhost:5173"
        };
        using var conn = db.Create();
        var rows = await conn.QueryAsync<SettingRow>("SELECT setting_key, setting_value FROM shop_settings");
        foreach (var r in rows)
            if (Keys.Contains(r.SettingKey)) result[r.SettingKey] = r.SettingValue ?? "";
        return result;
    }

    public async Task SaveAsync(string key, string value)
    {
        using var conn = db.Create();
        var n = await conn.ExecuteAsync("UPDATE shop_settings SET setting_value = :v WHERE setting_key = :k", new { v = value, k = key });
        if (n == 0)
            await conn.ExecuteAsync("INSERT INTO shop_settings (setting_key, setting_value) VALUES (:k, :v)", new { k = key, v = value });
    }
}
