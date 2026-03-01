import path from 'node:path';
import fs from 'fs-extra';
import { blake3 } from 'hash-wasm';

const MEME_DIR = 'meme';
const MEME_JSON = 'meme.json';

async function main() {
  await fs.ensureDir(MEME_DIR);

  const files = await fs.readdir(MEME_DIR);
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
  const imageFiles = files.filter(file => imageExts.includes(path.extname(file).toLowerCase()));

  if (imageFiles.length === 0) {
    console.log('meme 目录下没有图片文件');
    return;
  }

  const memeData: Record<string, { path: string; hash: string }> = {};

  for (const file of imageFiles) {
    const filePath = path.join(MEME_DIR, file);
    const buffer = await fs.readFile(filePath);
    const hash = await blake3(buffer);
    const name = path.basename(file, path.extname(file));

    memeData[name] = { path: file, hash };
    console.log(`处理: ${file} -> ${name}`);
  }

  await fs.writeJson(MEME_JSON, memeData, { spaces: 2 });
  console.log(`\n已生成 ${MEME_JSON}，共 ${Object.keys(memeData).length} 个表情包`);
}

main().catch(console.error);
