using Dapper;
using JewelryApi.Data;
using JewelryApi.Models;
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
                     COUNT(CASE WHEN status = 'Cancelled' THEN 1 END) AS cancelled_orders
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
                productCount = stock.ProductCount,
                stockValue = stock.StockValue
            },
            lowStock,
            last7Days,
            topProducts
        });
    }
}
