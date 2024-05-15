import {NextResponse} from 'next/server';
import { buffer } from 'node:stream/consumers';

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
const STABILITY_API_KEY = process.env.STABILITY_API_KEY;

const globalPrompt = "African Context: Imagine scenes inspired by the rich tapestry of African landscapes, cultures, and traditions. From the vast savannahs teeming with wildlife to bustling marketplaces filled with vibrant colors and sounds, capture the essence of Africa's diversity and beauty.";

async function generateImages(prompts) {
  let folderName = path.join(process.cwd(), 'public', 'tunmi');
  let folderIndex = 2;

  // Trouver un nom de dossier disponible s'il existe déjà
  while (fs.existsSync(folderName)) {
    folderName = path.join(process.cwd(), 'public', `tunmi${folderIndex}`);
    folderIndex++;
  }

  // Créer le dossier avec le nom trouvé
  fs.mkdirSync(folderName, { recursive: true });
  console.log(`Dossier "${folderName}" créé.`);

  const imagePaths = [];

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    try {
      const fullPrompt = `${globalPrompt}\n\n${prompt}`; // Combinaison du prompt global et du prompt spécifique

      const formData = new FormData();
      formData.append('prompt', fullPrompt);
      formData.append('output_format', 'png');
      formData.append('width', 1024);
      formData.append('height', 576);
      formData.append('style_preset', 'analog-film');

      const response = await axios.post(
        'https://api.stability.ai/v2beta/stable-image/generate/core',
        formData,
        {
          validateStatus: undefined,
          responseType: 'arraybuffer',
          headers: {
            Authorization: `Bearer ${STABILITY_API_KEY}`,
            Accept: 'image/*',
            ...formData.getHeaders(),
          },
        }
      );

      if (response.status === 200) {
        const fileName = path.join(folderName, `tunmi${i + 1}.png`);
        fs.writeFileSync(fileName, Buffer.from(response.data));
        console.log(`Image générée pour le prompt "${prompt}".`);
        imagePaths.push(fileName.replace(process.cwd() + '/public', ''));
      } else {
        throw new Error(`${response.status}: ${response.data.toString()}`);
      }
    } catch (error) {
      console.error('Une erreur s\'est produite lors de la génération de l\'image :', error);
    }
  }

  return { folderName: folderName.replace(process.cwd() + '/public', ''), imagePaths };
}

// export const config = {
//   api: {
//     bodyParser: {
//       sizeLimit: '10mb',
//     },
//   },
// };

export async function POST(req) {
  const body =await buffer(req.body);
  const { prompts } = JSON.parse(body);

  if (!prompts || !Array.isArray(prompts)) {
    return NextResponse.json({ error: 'Prompts are required and must be an array.' }, { status: 400 });
  }

  try {
    const { folderName, imagePaths } = await generateImages(prompts);
    return NextResponse.json({ folderName, images: imagePaths }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req) {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}