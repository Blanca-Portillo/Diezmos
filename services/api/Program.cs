using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices(services =>
    {
        services.AddSingleton<TokenValidator>();
        services.AddSingleton<ChurchRepository>();
        services.AddSingleton<BlobFiles>();
    })
    .Build();

host.Run();
