const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// Test pentru funcționalitățile premium
async function testPremiumFeatures() {
    try {
        console.log('🧪 Testing Premium Features...\n');

        // Step 1: Login as premium user (you'll need to create one or use existing)
        console.log('1. Attempting login...');
        const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
            email: 'test@example.com', // Replace with your test user
            password: 'password123'
        });

        const token = loginResponse.data.token;
        console.log('✅ Login successful, token received\n');

        // Step 2: Upload test image for analysis
        console.log('2. Uploading test image for premium analysis...');
        
        // Check if test image exists
        const testImagePath = './deepfakeDetector/test.jpg';
        if (!fs.existsSync(testImagePath)) {
            console.log('❌ Test image not found. Creating a placeholder...');
            // In real scenario, you'd have a test image
            return;
        }

        const formData = new FormData();
        formData.append('video', fs.createReadStream(testImagePath));
        formData.append('userTier', 'premium');
        formData.append('enableAdvancedFeatures', 'true');

        const uploadResponse = await axios.post('http://localhost:5000/api/analysis/upload', formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': `Bearer ${token}`
            },
            timeout: 60000
        });

        console.log('✅ Upload successful!\n');
        console.log('📊 Analysis Results:');
        console.log('- File ID:', uploadResponse.data.fileId);
        console.log('- Is Premium:', uploadResponse.data.result?.isPremium || false);
        console.log('- Has Advanced Heatmap:', uploadResponse.data.result?.heatmapAdvanced || false);
        console.log('- Premium Features:', uploadResponse.data.result?.premiumFeatures || []);
        
        if (uploadResponse.data.result?.heatmapStats) {
            console.log('- Stats Available:', Object.keys(uploadResponse.data.result.heatmapStats));
        }

        console.log('\n🎉 Premium features test completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
        
        if (error.response?.status === 401) {
            console.log('\n💡 Tip: Make sure you have a valid user account and the server is running');
        }
    }
}

// Test pentru verificarea endpoint-urilor
async function testEndpoints() {
    console.log('\n🔍 Testing API Endpoints...\n');
    
    try {
        // Test basic health
        const healthResponse = await axios.get('http://localhost:5000/api/analysis/health');
        console.log('✅ Health check:', healthResponse.data);
    } catch (error) {
        console.log('❌ Health check failed:', error.message);
    }
}

// Main test function
async function runTests() {
    console.log('🚀 Starting Premium Features Test Suite\n');
    console.log('Make sure the backend server is running on localhost:5000\n');
    
    await testEndpoints();
    await testPremiumFeatures();
    
    console.log('\n📝 Test Instructions:');
    console.log('1. Create a premium user account or update an existing user to premium tier');
    console.log('2. Update the email/password in this test file');
    console.log('3. Ensure you have a test image at ./deepfakeDetector/test.jpg');
    console.log('4. Run: node testPremiumFeatures.js');
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests();
}

module.exports = { testPremiumFeatures, testEndpoints };
