const fs = require('fs');
const readline = require('readline');

async function main() {
  const fileStream = fs.createReadStream('C:\\\\Users\\\\Anderson Campos\\\\.gemini\\\\antigravity-ide\\\\brain\\\\5a363486-2e65-490f-82c8-b6572541f704\\\\.system_generated\\\\logs\\\\transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes('406') || line.includes('Not Acceptable') || line.includes('error')) {
      // Print lines matching console output or errors in subagent
      if (line.includes('browser_subagent') || line.includes('CONSOLE') || line.includes('console')) {
        console.log(line.substring(0, 1000) + '...');
      }
    }
  }
}

main();
