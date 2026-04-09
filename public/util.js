function clearClientStorage() {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (error) {
    console.warn("Could not clear browser storage:", error);
  }
}
