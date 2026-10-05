using Oracle.ManagedDataAccess.Client;

namespace JewelryApi.Data;

public class DbConnectionFactory
{
    private readonly string _cs;
    public DbConnectionFactory(IConfiguration config) => _cs = config.GetConnectionString("Oracle")!;

    // One short-lived connection per request; "using" closes it and returns it to the pool.
    public OracleConnection Create() => new OracleConnection(_cs);
}
