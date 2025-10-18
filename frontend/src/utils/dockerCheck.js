export async function checkDockerStatus() {
  if (!window.electronAPI) return { available: true };

  try {
    // Check if Docker is running
    const response = await fetch("http://localhost:4000/healthz");
    return { available: response.ok };
  } catch (error) {
    return { available: false, error: error.message };
  }
}
