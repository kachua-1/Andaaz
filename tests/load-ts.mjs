export async function loadTsModule(relativePath) {
  return import(new URL(relativePath, import.meta.url));
}
