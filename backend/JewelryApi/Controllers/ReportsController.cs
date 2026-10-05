using Dapper;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReportsController(DbConnectionFactory db) : ControllerBase
{
    // Everything the dashboard page needs, in one call.
    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard()
    {
        using var conn = db.Create();

        var sales = await conn.QuerySingleAsync<SalesSummary>(
            @"SELECT NVL(SUM(CASE WHEN status = 'Completed' THEN total_amount END), 0) AS total_sales,
                     COUNT(CASE WHEN status = 'Completed' THEN 1 END) AS completed_orders,
                     COUNT(CASE WHEN status = 'Cancelled' THEN 1 END) AS cancelled_orders,
                     COUNT(CASE WHEN status = 'Pending' THEN 1 END) AS pending_orders
              FROM orders");

        var stock = await conn.QuerySingleAsync<StockSummary>(
            @"SELECT COUNT(*) AS product_count,
                     NVL(SUM(stock_quantity * unit_price), 0) AS stock_value
              FROM products");

        var lowStock = await conn.QueryAsync<LowStockItem>(
            @"SELECT product_id, product_name, stock_quantity
              FROM products WHERE stock_quantity <= 3
              ORDER BY stock_quantity, product_name");

        var last7Days = await conn.QueryAsync<DailySales>(
            @"SELECT TRUNC(order_date) AS sale_day, COUNT(*) AS order_count, SUM(total_amount) AS total
              FROM orders
              WHERE status = 'Completed' AND order_date >= TRUNC(SYSDATE) - 6
              GROUP BY TRUNC(order_date)
              ORDER BY TRUNC(order_date)");

        var topProducts = await conn.QueryAsync<TopProduct>(
            @"SELECT * FROM (
                SELECT p.product_name, SUM(oi.quantity) AS qty_sold, SUM(oi.line_total) AS revenue
                FROM order_items oi
                JOIN orders o ON o.order_id = oi.order_id
                JOIN products p ON p.product_id = oi.product_id
                WHERE o.status = 'Completed'
                GROUP BY p.product_name
                ORDER BY SUM(oi.quantity) DESC)
              WHERE ROWNUM <= 5");

        return Ok(new
        {
            summary = new
            {
                totalSales = sales.TotalSales,
                completedOrders = sales.CompletedOrders,
                cancelledOrders = sales.CancelledOrders,
                pendingOrders = sales.PendingOrders,
                productCount = stock.ProductCount,
                stockValue = stock.StockValue
            },
            lowStock,
            last7Days,
            topProducts
        });
    }

    // Sales report for a date range (Manager only). Only Completed orders are counted.
    // GET /api/reports/sales?from=2026-10-01&to=2026-10-31
    [HttpGet("sales")]
    [Authorize(Roles = "Manager")]
    public async Task<IActionResult> Sales([FromQuery(Name = "from")] DateTime dateFrom, [FromQuery(Name = "to")] DateTime dateTo)
    {
        var f = dateFrom.Date;
        var t = dateTo.Date.AddDays(1); // "to" day is included, so compare with < next midnight
        if (t <= f) return BadRequest(new { error = "The 'To' date cannot be before the 'From' date." });
        if ((t - f).TotalDays > 366) return BadRequest(new { error = "Please choose a range of at most one year." });

        using var conn = db.Create();
        var p = new { f, t };

        var totals = await conn.QuerySingleAsync<SalesSummary>(
            @"SELECT NVL(SUM(total_amount), 0) AS total_sales, COUNT(*) AS completed_orders
              FROM orders
              WHERE status = 'Completed' AND order_date >= :f AND order_date < :t", p);

        var itemsSold = await conn.ExecuteScalarAsync<int>(
            @"SELECT NVL(SUM(oi.quantity), 0)
              FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
              WHERE o.status = 'Completed' AND o.order_date >= :f AND o.order_date < :t", p);

        var byDay = await conn.QueryAsync<DailySales>(
            @"SELECT TRUNC(order_date) AS sale_day, COUNT(*) AS order_count, SUM(total_amount) AS total
              FROM orders
              WHERE status = 'Completed' AND order_date >= :f AND order_date < :t
              GROUP BY TRUNC(order_date)
              ORDER BY TRUNC(order_date)", p);

        var byCategory = await conn.QueryAsync<ReportRow>(
            @"SELECT NVL(c.category_name, '(none)') AS label,
                     SUM(oi.quantity) AS qty, SUM(oi.line_total) AS revenue
              FROM order_items oi
              JOIN orders o ON o.order_id = oi.order_id
              JOIN products p ON p.product_id = oi.product_id
              LEFT JOIN categories c ON c.category_id = p.category_id
              WHERE o.status = 'Completed' AND o.order_date >= :f AND o.order_date < :t
              GROUP BY NVL(c.category_name, '(none)')
              ORDER BY SUM(oi.line_total) DESC", p);

        var byProduct = await conn.QueryAsync<ReportRow>(
            @"SELECT p.product_name AS label,
                     SUM(oi.quantity) AS qty, SUM(oi.line_total) AS revenue
              FROM order_items oi
              JOIN orders o ON o.order_id = oi.order_id
              JOIN products p ON p.product_id = oi.product_id
              WHERE o.status = 'Completed' AND o.order_date >= :f AND o.order_date < :t
              GROUP BY p.product_id, p.product_name
              ORDER BY SUM(oi.line_total) DESC", p);

        // for employees "qty" means number of orders
        var byEmployee = await conn.QueryAsync<ReportRow>(
            @"SELECT e.first_name || ' ' || e.last_name AS label,
                     COUNT(*) AS qty, SUM(o.total_amount) AS revenue
              FROM orders o
              JOIN employees e ON e.employee_id = o.employee_id
              WHERE o.status = 'Completed' AND o.order_date >= :f AND o.order_date < :t
              GROUP BY e.employee_id, e.first_name, e.last_name
              ORDER BY SUM(o.total_amount) DESC", p);

        var orders = totals.CompletedOrders;
        return Ok(new
        {
            dateFrom = f, dateTo = dateTo.Date,
            summary = new
            {
                totalSales = totals.TotalSales,
                orderCount = orders,
                itemsSold,
                averageOrder = orders == 0 ? 0m : Math.Round(totals.TotalSales / orders, 2)
            },
            byDay, byCategory, byProduct, byEmployee
        });
    }
}
