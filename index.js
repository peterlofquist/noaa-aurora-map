const fs = require('fs'),
  path = require('path'),
  PNGImage = require('pngjs-image');
const requireImageSize = {
  width: 1024,
  height: 512
};

const SunCalc = require('suncalc');
const validAtRegex = /Product Valid At: (.*)/;

let AuroraMap = {};

AuroraMap.heatMapColorCalculator = activity => {
  let percentPerHex = 255 / 100;
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = AuroraMap.easeOutExpo(activity, 0, 225, 100);
  if (activity > 0 && activity <= 50) {
    red = Math.round((percentPerHex * 2) * activity);
    green = 255;
  } else {
    red = 255;
    let greenFix = activity - 50;
    green = Math.round((percentPerHex * 2) * (50 - greenFix));
  }
  return {
    red: red,
    green: green,
    blue: blue,
    alpha: alpha
  };
}

AuroraMap.easeOutExpo = (t, b, c, d) => {
  //http://gizma.com/easing/
  return c * ( -Math.pow( 2, -10 * t / d ) + 1 ) + b;
}

AuroraMap.version = require('./package.json').version;

AuroraMap.parseAuroraActivityData = rawData => {
  let data = rawData.split('#');
  data = data[data.length - 1].replace(/\n/, '');
  let latitudes = data.split('\n');
  latitudes.splice(512, latitudes.length);
  let dataPoints = [];
  latitudes.forEach(latitude => {
    longitudes = latitude.replace(/\s{2,}/g, ',').split(',');
    longitudes.shift();
    dataPoints.push(longitudes);
  });
  return dataPoints.reverse();
}

AuroraMap.getUTCDateString = () => {
  let date = new Date();
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth() + 1;
  if (month < 10) month = '0' + month;
  let day = date.getUTCDate();
  if (day < 10) day = '0' + day;
  let hour = date.getUTCHours();
  if (hour < 10) hour = '0' + hour;
  let minute = date.getUTCMinutes();
  if (minute < 10) minute = '0' + minute;
  let second = date.getUTCSeconds();
  if (second < 10) second = '0' + second;
  let dateString = year + '/' + month + '/' + day + ' ' +
  hour + ':' + minute + ':' + second + ' UTC';
  return dateString;
}

AuroraMap.getFileSystemSafeUTCDateString = () => {
  return AuroraMap.getUTCDateString().replace(/\//g, '-').replace(/\s/g, '--').replace(/:/g, '-');
}

AuroraMap.colorMix = (oldColor, newColor) => {
  let percentageAlpha = newColor.alpha / 255;
  let newRed = Math.round((oldColor.red + (newColor.red * percentageAlpha)) / (1 + percentageAlpha));
  let newGreen = Math.round((oldColor.green + (newColor.green * percentageAlpha)) / (1 + percentageAlpha));
  let newBlue = Math.round((oldColor.blue + (newColor.blue * percentageAlpha)) / (1 + percentageAlpha));

  return {
    red: newRed,
    green: newGreen,
    blue: newBlue,
    alpha: Math.max(oldColor.alpha, newColor.alpha)
  };
}

AuroraMap.colorForActivity = activity => {
  if (activity == 0) return null;
  let color = null;
  Object.keys(AuroraMap.heatMapColors).forEach(level => {
    if (activity > parseInt(level)) color = AuroraMap.heatMapColors[level];
  });
  return color;
}

AuroraMap.generateMap = (rawData, output, callback) => {
  let cb = (err, file) => {
    if (typeof callback  === 'function') {
      callback(err, file);
    }
  }
  let basemap = path.join(path.dirname(fs.realpathSync(__filename)), './maps/basemap-512.png');
  PNGImage.readImage(basemap, (err, baseImage) => {
    if (err) return cb(err);
    if (requireImageSize.width !== baseImage.getWidth() || requireImageSize.height !== baseImage.getHeight()) {
      return cb('Wrong image size. Requires a image size of 1024x512');
    }
    let image = PNGImage.copyImage(baseImage);
    let validAtDate = new Date(rawData.match(validAtRegex)[1]);
    let utcDate = new Date(Date.UTC(validAtDate.getFullYear(), validAtDate.getMonth(), validAtDate.getDate(), validAtDate.getHours(), validAtDate.getMinutes(), validAtDate.getSeconds()));
    let data = AuroraMap.parseAuroraActivityData(rawData);
    data.forEach((latitude, lat) => {
      let latDegreePoint = (180 / data.length);
      let latDegree = 90 - ((latDegreePoint / 2) + (lat * latDegreePoint));
      latitude.forEach((activity, lon) => {
        let lonDegreePoint = (360 / latitude.length);
        let lonDegree = -180 + ((lonDegreePoint / 2) + (lon * lonDegreePoint));
        let idx = image.getIndex(lon, lat);
        let color = {
          red: image.getRed(idx),
          green: image.getGreen(idx),
          blue: image.getBlue(idx),
          alpha: image.getAlpha(idx)
        };
        let times = SunCalc.getTimes(utcDate, latDegree, lonDegree);
        // TODO: do the same for dawk & dusk, nauticalDawn & nauticalDusk
        if (
          utcDate.getTime() < times.nightEnd.getTime()
          || utcDate.getTime() > times.night.getTime()
        ) {
          color = AuroraMap.colorMix(color, { red: 0, green: 0, blue: 0, alpha: 127.5 });
        }
        if (activity > 0) {
          let activityColor = AuroraMap.heatMapColorCalculator(activity);
          color = AuroraMap.colorMix(color, activityColor);
        }
        image.setAt(lon, lat, color);
      });
    });
    image.writeImage(output, err => {
      if (err) return cb(err);
      cb(null, output);
    });
  });
}

module.exports = AuroraMap;
