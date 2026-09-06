import sharp from 'sharp';
await Promise.all([
  sharp('public/icon.svg').resize(192, 192).png().toFile('public/icon-192.png'),
  sharp('public/icon.svg').resize(512, 512).png().toFile('public/icon-512.png'),
  sharp('public/icon.svg').resize(180, 180).png().toFile('public/apple-touch-icon.png'),
]);
