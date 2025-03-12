document.getElementById("uploadForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    const mediaFile = document.getElementById("mediaFile").files[0];
    const userId = document.getElementById("userId").value; 

    if (!mediaFile) {
        alert("Vă rugăm să încărcați un fișier.");
        return;
    }

    if (!userId) {
        alert("Vă rugăm să introduceți un userId.");
        return;
    }

    try {
        const result = await uploadFile(mediaFile, userId);
        document.getElementById("result").innerText = `Fake Score: ${result.detectionResult.fakeScore}% \n Confidence Score: ${result.detectionResult.confidenceScore}%`;
    } catch (error) {
        console.error("Eroare la încărcarea fișierului:", error);
        document.getElementById("result").innerText = "A apărut o eroare la încărcarea fișierului.";
    }
});


async function uploadFile(mediaFile, userId) {
    const formData = new FormData();
    formData.append('media', mediaFile);
    formData.append('userId', userId); 

    const response = await fetch('http://localhost:5000/api/analysis/upload', {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error('Upload failed');
    }

    const result = await response.json();
    return result;
}
