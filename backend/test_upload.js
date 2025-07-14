const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testUpload() {
  try {
    const imagePath = path.join(__dirname, 'public', 'uploads', '1_1743760600919.jpeg');
    
    if (!fs.existsSync(imagePath)) {
      console.log('Image not found:', imagePath);
      return;
    }
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(imagePath));
    
    console.log('Sending request to backend...');
    const response = await axios.post('http://localhost:5000/api/analysis/upload', formData, {
      headers: {
        ...formData.getHeaders()
      },
      timeout: 60000 // 60 seconds timeout
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
    }
  }
}

testUpload();
