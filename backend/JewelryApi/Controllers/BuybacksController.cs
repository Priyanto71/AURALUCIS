using System.Data;
using Dapper;
using JewelryApi.Auth;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Manager,Owner")]
public class BuybacksController(DbConnectionFactory db) : ControllerBase
{
    private static readonly string[] Methods = { "Cash", "Card", "bKash", "Nagad", "Bank" };

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = db.Create();
        var rows = await conn.QueryAsync<OldGoldBuybackRow>(
            @"SELECT * FROM (
                SELECT t.transaction_id AS ""TransactionId"", t.txn_date AS ""TxnDate"", t.customer_id AS ""CustomerId"",
                       c.first_name || ' ' || c.last_name AS ""CustomerName"",
                       e.first_name || ' ' || e.last_name AS ""EmployeeName"",
                       t.metal_type AS ""MetalType"", t.purity AS ""Purity"", t.gross_weight AS ""GrossWeight"", t.stone_weight AS ""StoneWeight"",
                       t.net_weight AS ""NetWeight"", t.rate_per_gram AS ""RatePerGram"", t.valuation_amount AS ""ValuationAmount"",
                       t.settlement_method AS ""SettlementMethod"", t.payout_reference AS ""PayoutReference"", t.status AS ""Status"", t.notes AS ""Notes""
                FROM old_gold_transactions t
                LEFT JOIN customers c ON c.customer_id = t.customer_id
                JOIN employees e ON e.employee_id = t.employee_id
                WHERE t.txn_type = 'BUYBACK'
                ORDER BY t.transaction_id DESC
              ) WHERE ROWNUM <= 200");
        return Ok(rows);
    }

    [HttpPost]
    public async Task<IActionResult> Create(OldGoldBuybackRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.MetalType) || req.MetalType.Trim().Length > 50)
            return BadRequest(new { error = "Enter a valid metal type (maximum 50 characters)." });

        if (string.IsNullOrWhiteSpace(req.Purity) || req.Purity.Trim().Length > 20)
            return BadRequest(new { error = "Enter a valid purity (maximum 20 characters)." });

        if (req.GrossWeight <= 0 || req.StoneWeight < 0 || req.StoneWeight >= req.GrossWeight)
            return BadRequest(new { error = "Gross weight must be positive; stone weight must be non-negative and less than gross weight." });

        if (decimal.Round(req.GrossWeight, 3) != req.GrossWeight ||
            decimal.Round(req.StoneWeight, 3) != req.StoneWeight)
            return BadRequest(new { error = "Weights can have at most 3 decimal places." });

        if (!Methods.Contains(req.SettlementMethod))
            return BadRequest(new { error = "Choose Cash, Card, bKash, Nagad or Bank." });

        if (req.PayoutReference?.Length > 100)
            return BadRequest(new { error = "Payout reference cannot exceed 100 characters." });

        if (req.Notes?.Length > 500)
            return BadRequest(new { error = "Notes cannot exceed 500 characters." });

        var metal = req.MetalType.Trim();
        var ratePurity = string.IsNullOrWhiteSpace(req.Purity) || req.Purity.Trim().Equals("Standard", StringComparison.OrdinalIgnoreCase) ? null : req.Purity.Trim();
        var purity = ratePurity ?? "Standard";
        var netWeight = req.GrossWeight - req.StoneWeight;
        var employeeId = User.GetEmployeeId()!.Value;

        using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = conn.BeginTransaction();

        try
        {
            if (req.CustomerId.HasValue)
            {
                var exists = await conn.ExecuteScalarAsync<int>(
                    "SELECT COUNT(*) FROM customers WHERE customer_id = :id",
                    new { id = req.CustomerId.Value }, tx);

                if (exists == 0)
                {
                    tx.Rollback();
                    return BadRequest(new { error = "Selected customer does not exist." });
                }
            }

            var rate = await conn.ExecuteScalarAsync<decimal?>(
                @"SELECT rate_per_gram FROM vw_current_rates
                  WHERE metal_type = :metal AND NVL(purity, '-') = NVL(:purity, '-')",
                new { metal, purity = ratePurity }, tx);

            if (rate is null || rate <= 0)
            {
                tx.Rollback();
                return BadRequest(new { error = "No current rate exists for this metal and purity. Set the rate first." });
            }

            var valuation = decimal.Round(netWeight * rate.Value, 2, MidpointRounding.AwayFromZero);
            if (valuation <= 0)
            {
                tx.Rollback();
                return BadRequest(new { error = "Calculated buyback value must be greater than zero." });
            }

            var id = await conn.ExecuteScalarAsync<int>(
                "SELECT old_gold_seq.NEXTVAL FROM DUAL", transaction: tx);

            await conn.ExecuteAsync(
                @"INSERT INTO old_gold_transactions
                    (transaction_id, customer_id, employee_id, txn_type, metal_type, purity,
                     gross_weight, stone_weight, net_weight, rate_per_gram, valuation_amount,
                     settlement_method, payout_reference, linked_order_id, notes)
                  VALUES
                    (:id, :customerId, :employeeId, 'BUYBACK', :metal, :purity,
                     :gross, :stone, :net, :rate, :valuation,
                     :method, :reference, NULL, :notes)",
                new
                {
                    id,
                    customerId = req.CustomerId,
                    employeeId,
                    metal,
                    purity,
                    gross = req.GrossWeight,
                    stone = req.StoneWeight,
                    net = netWeight,
                    rate = rate.Value,
                    valuation,
                    method = req.SettlementMethod,
                    reference = string.IsNullOrWhiteSpace(req.PayoutReference) ? null : req.PayoutReference.Trim(),
                    notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim()
                }, tx);

            await AuditLogger.LogAsync(conn, tx, employeeId, "OLD_GOLD_BUYBACK", "OldGold",
                id.ToString(),
                $"{metal} {purity}; net {netWeight}g; rate {rate}; payout {valuation} by {req.SettlementMethod}");

            tx.Commit();

            return Ok(new
            {
                transactionId = id,
                metalType = metal,
                purity,
                grossWeight = req.GrossWeight,
                stoneWeight = req.StoneWeight,
                netWeight,
                ratePerGram = rate.Value,
                valuationAmount = valuation,
                settlementMethod = req.SettlementMethod
            });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }
}



