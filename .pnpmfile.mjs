export const hooks = {
  readPackage(pkg) {
    // The stable Astro checker needs the legacy compiler API, not the project's TS 7.
    if (pkg.name === "@astrojs/check" && pkg.version === "0.9.10") {
      delete pkg.peerDependencies?.typescript;
      pkg.dependencies = { ...pkg.dependencies, typescript: "6.0.3" };
    }
    return pkg;
  },
};
