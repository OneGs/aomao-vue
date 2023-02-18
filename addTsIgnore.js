const fs = require("fs"),
  path = require("path");

function walkSync(currentDirPath, callback) {
  fs.readdirSync(currentDirPath, { withFileTypes: true }).forEach(function (
    dirent
  ) {
    var filePath = path.join(currentDirPath, dirent.name);
    if (dirent.isFile()) {
      callback(filePath, dirent);
    } else if (dirent.isDirectory()) {
      walkSync(filePath, callback);
    }
  });
}

walkSync("src/aomao", function (filePath, stat) {
  const isTsFile = /\.ts/.test(filePath);

  if (isTsFile) {
    fs.readFile(filePath, "utf8", (error, data) => {
      if (!data.includes("// @ts-nocheck")) {
        fs.writeFile(filePath, `// @ts-nocheck \n ${data}`, () => {
          console.log(filePath, "success");
        });
      }
    });
  }
  // src/icons/card_flight.png
  // src/icons/clock.png
  // src/icons/icon-home-edit.png
  // src/icons/iconSprites.json
  // src/index.js
  // do something with "filePath"...
});
