const uploadContainer = document.getElementById("uploadContainer");
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const captionsText = document.getElementById("captions-text");
const outputSection = document.getElementById("outputSection");

uploadBtn.addEventListener("click", function (event) {
  event.preventDefault(); 
  event.stopPropagation(); 

  captionsText.innerHTML = "";

  const file = fileInput.files[0];
  if (!file) {
    alert("Please select a file first.");
    return;
  }
  const dots = ["", ".", "..", "..."];
  let dotIndex = 0;
  const intervalId = setInterval(() => {
    process.textContent = "Processing" + dots[dotIndex];
    dotIndex = (dotIndex + 1) % dots.length;
  }, 500); // Change every 500ms

  const process = document.getElementById("processing");
  process.style.display = "block"; // Show processing message

  const formData = new FormData();
  formData.append("file", file);

  console.log('Starting fetch request...');
  
  fetch("http://127.0.0.1:5000/api/transcribe", {
    method: "POST",
    body: formData
  })
    .then((response) => response.json())
    .then((data) => {
      captionsText.innerHTML = data.text || data.transcription || "No transcription available";
      outputSection.style.display = "block";
    })
    .catch((error) => {
      console.error("Error:", error);
      alert("An error occurred while uploading.");
    })
    .finally(() => {
        clearInterval(intervalId); // Stop updating dots

      process.style.display = "none"; // Hide processing message
      clearClientStorage();
    });
});
