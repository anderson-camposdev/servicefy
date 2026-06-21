const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./lint_results.json', 'utf8'));
const errors = data.filter(file => file.errorCount > 0).map(file => {
  return {
    filePath: file.filePath,
    messages: file.messages.filter(m => m.severity === 2)
  };
});
console.log(JSON.stringify(errors, null, 2));
