const testOutput = `2025-07-10 23:51:59.123: some tensorflow warning
Some other log message
{"fakeScore":47.18,"confidenceScore":52.82,"isDeepfake":false,"processingTime":10.226,"analysisTime":"2025-07-10 23:51:59","fileName":"imagineDNSC_alterata_1752179917670.jpeg","debugInfo":{"model_loaded":true,"input_shape":[299,299,3],"model_name":"AdvancedDeepfakeDetector","prediction_raw":0.4718189537525177},"modelType":"advanced","inputShape":[299,299,3]}
Some trailing message`;

function parseJsonFromOutput(output) {
  try {
    if (!output || typeof output !== 'string') {
      console.log('parseJsonFromOutput: No output or invalid type');
      return null;
    }

    // Log raw output for debugging (first 1000 chars)
    console.log(`Raw Python output (first 1000 chars): ${output.substring(0, 1000)}`);

    // Clean output and remove all non-printable characters except newlines
    const cleanedOutput = output.replace(/[^\x20-\x7E\n\r\t]/g, '').trim();
    
    // Split into lines and find JSON
    const lines = cleanedOutput.split(/\r?\n/);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and lines that don't start with '{'
      if (!line || !line.startsWith('{')) {
        continue;
      }
      
      // Find complete JSON object in the line
      let braceCount = 0;
      let jsonEnd = -1;
      
      for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') {
          braceCount++;
        } else if (line[j] === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonEnd = j;
            break;
          }
        }
      }
      
      if (jsonEnd > -1) {
        const jsonCandidate = line.substring(0, jsonEnd + 1);
        try {
          const parsed = JSON.parse(jsonCandidate);
          console.log(`Successfully parsed JSON from line ${i}: ${jsonCandidate.substring(0, 100)}...`);
          return parsed;
        } catch (e) {
          console.log(`Failed to parse JSON candidate from line ${i}: ${e.message}`);
          continue;
        }
      }
    }

    // Fallback: try to parse the entire cleaned output
    try {
      const parsed = JSON.parse(cleanedOutput);
      console.log('Direct JSON parse successful');
      return parsed;
    } catch (e) {
      console.log(`Direct parse failed: ${e.message}`);
    }

    // Last resort: extract JSON using regex
    const jsonMatch = cleanedOutput.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('Regex extraction successful');
        return parsed;
      } catch (e) {
        console.log(`Regex extraction failed: ${e.message}`);
      }
    }

    console.log('Failed to parse JSON from output, raw sample:', cleanedOutput.substring(0, 300));
    return null;
  } catch (error) {
    console.log(`Error in parseJsonFromOutput: ${error.message}`);
    return null;
  }
}

const result = parseJsonFromOutput(testOutput);
console.log('Final result:', result);
