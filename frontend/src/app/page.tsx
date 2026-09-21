export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
      <main className="flex flex-col items-center justify-center p-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-brand-green sm:text-6xl">
          TranoGasy 2.0
        </h1>
        <p className="mt-6 text-lg leading-8 text-gray-500">
          The premium real estate platform for Madagascar.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <a
            href="#"
            className="rounded-full bg-brand-green px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green transition-all"
          >
            Explore Properties
          </a>
        </div>
      </main>
    </div>
  );
}
