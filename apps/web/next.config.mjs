const nextConfig = {
  output: "standalone",
  async rewrites() {
    const apiInternalUrl = process.env.API_INTERNAL_URL || "http://localhost:4000";
    return [
      {
        source: "/api-proxy/:path*",
        destination: `${apiInternalUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
