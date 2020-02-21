const fs = require('fs'); 
const { JSDOM } = require('jsdom')

function getBezierCurveCoordinate(x0, y0, x1, y1, x2, y2, x3, y3) {
  const t = 0.5;

  const x01 = ( (1 - t) * x0 ) + (t * x1);
  const y01 = ( (1 - t) * y0 ) + (t * y1);
  const x12 = ( (1 - t) * x1 ) + (t * x2);
  const y12 = ( (1 - t) * y1 ) + (t * y2);
  const x23 = ( (1 - t) * x2 ) + (t * x3);
  const y23 = ( (1 - t) * y2 ) + (t * y3);

  const x012 = ( (1 - t) * x01 ) + (t * x12);
  const y012 = ( (1 - t) * y01 ) + (t * y12);
  const x123 = ( (1 - t) * x12 ) + (t * x23);
  const y123 = ( (1 - t) * y12 ) + (t * y23);

  const x0123 = ( (1 - t) * x012 ) + (t * x123);
  const y0123 = ( (1 - t) * y012 ) + (t * y123);

  return [x0123, y0123];
} 

function getSmoothCurveCoordinate(x1,y1,x3,y3,x4,y4) {
  const slope = (y4 - y1) / (x4 - x1);
  const yIntercept23 = y3 - (slope * x3);
  
  const xMirror14 = (x4 + x1) / 2;
  const yMirror14 = (y4 + y1) / 2;
  const slopeMirror = -(1 / slope);
  const yInterceptMirror = yMirror14 - (slopeMirror * xMirror14);

  const xMirror23 = (yInterceptMirror - yIntercept23) / (slope - slopeMirror);
  const yMirror23 = slope * xMirror23 + yIntercept23;

  const x2 = xMirror23 * 2 - x3;
  const y2 = yMirror23 * 2 - y3;

  return getBezierCurveCoordinate(x1,y1,x2,y2,x3,y3,x4,y4);
}

function getCoordinateM(m) {
  type = m[0];
  if (type !== 'M' && type !== 'm') {
    throw "Mismatched attribute d (Coordinate M)";
  }
  m = m.slice(1).trim().replace(/-/g,',-').replace(/ /g,',').replace(/,,/g, ',');
  if (type === ',') {
    m = m.slice(1);
  }
  m = m.split(',');
  if (m.length !== 2) {
    throw "Mismatched attribute d (Coordinate M)";
  }
  m = m.map(e => Number(e));
  return m;
}

function getCoordinateC(c, x, y) {
  type = c[0];
  c = c.slice(1).trim().replace(/-/g,',-').replace(/ /g,',').replace(/,,/g, ',');
  while (c[0] === ',') {
    c = c.slice(1);
  }
  c = c.split(',');
  if (c.length % 6) {
    throw 'Mismatched attribute d (Coordinate C)';
  }
  c = c.map(e => Number(e));

  const chunk = [];
  while(c.length > 0) {
    if (type === 'c') {
      c[0] += x;
      c[1] += y;
      c[2] += x;
      c[3] += y;
      c[4] += x;
      c[5] += y;
    }
    chunk.push(getBezierCurveCoordinate(x,y,c[0],c[1],c[2],c[3],c[4],c[5]));
    chunk.push(c.slice(4,6));
    x = c[4];
    y = c[5];
    c = c.slice(6);
  }
  return chunk;
}

function getCoordinateS(s, x, y) {
  type = s[0];
  s = s.slice(1).trim().replace(/-/g,',-').replace(/ /g,',').replace(/,,/g, ',');
  while (s[0] === ',') {
    s = s.slice(1);
  }
  s = s.split(',');
  if (s.length % 4) {
    throw 'Mismatched attribute d (Coordinate S)';
  }
  s = s.map(e => Number(e));
  const chunk = [];
  while(s.length > 0) {
    if (type === 's') {
      s[0] += x;
      s[1] += y;
      s[2] += x;
      s[3] += y;
    }
    chunk.push(getSmoothCurveCoordinate(x,y,s[0],s[1],s[2],s[3]));
    chunk.push(s.slice(2,4));
    x = s[2];
    y = s[3];
    s = s.slice(4);
  }
  return chunk;
}

function transformPath(path) {
  let result = [];
  const ds = path
    .replace(/c/g,'|c')
    .replace(/C/g,'|C')
    .replace(/s/g,'|s')
    .replace(/S/g,'|S')
    .split('|');

  m = getCoordinateM(ds[0]);
  let startX = m[0];
  let startY = m[1];
  result.push(m);

  css = ds.slice(1);
  css.forEach(cs => {
    const type = cs[0];
    if (type === 'C' || type === 'c') {
      cs = getCoordinateC(cs, startX, startY);
    } else if (type === 'S' || type === 's') {
      cs = getCoordinateS(cs, startX, startY)
    } else {
      throw 'Mismatched attribute d';
    }
    result = result.concat(cs);
    startX = result[result.length - 1][0];
    startY = result[result.length - 1][1];
  });
  return result;
}

function getPathsData(element, paths) {
  let d = element.getAttribute("d");
  if(!d) {
    const childrenCount = element.children.length;
    for(let i = 0; i < childrenCount; i++) {
      let res = getPathsData(element.children[i], paths);
      paths = res;
    }
  } else {
    const type = element.getAttribute('kvg:type') || '';
    paths['absolute'].push(transformPath(d));
    paths['svg'].push(d);
    paths['stroke'].push(type.replace(/[a-z]/g, ''));
  }
  return paths;
}

function readFileData(hex) {
  return new Promise((resolve, reject) =>  {
    fs.readFile('./kanji/' + hex + '.svg', {}, (err, file) => {
      try{
        if (err) {
          reject(err);
        } else {
          const root = JSDOM.fragment(file.toString());
          const element = root.getElementById("kvg:" + hex);
          const paths = getPathsData(element, { absolute: [], svg: [], stroke: [] });

          const data = {}
          data[hex] = {
            element: element.getAttribute('kvg:element'),
            numOfStroke: paths['stroke'].length,
            stroke: paths['stroke'],
            absolutePaths: paths['absolute'],
            svgPaths: paths['svg']
          };
          resolve(data);
        }
      } catch (e) {
        reject(hex + ": " + e);
      }
    });
  }).catch(err => Promise.reject(err));
}

function mapKanjiData() {
  return new Promise((resolve, reject) =>  {
  fs.readdir('./kanji/', (err, files) => {
      try{
        if (err) {
          reject(err);
        } else {
          let result = {};
          let waiting = files.length;
          files.forEach(file =>{
            readFileData(file.substring(0, file.length - 4))
              .then((res) => {
                result = {
                  ...result,
                  ...res
                };
                waiting--;
                if (waiting === 0) {
                  resolve(result);
                }
              })
              .catch(err => reject(err));
          });
        }
      } catch (e) {
        reject(e);
      }
    });
  });
}

mapKanjiData()
  .then(res => {
    try {
      fs.writeFileSync('kanji.json', JSON.stringify(res), 'utf-8')
    } catch (err) {
      console.error(err)
    }
  })
  .catch(err => console.error(err));
