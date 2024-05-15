// route.js
import { NextResponse } from 'next/server';
import { buffer } from 'node:stream/consumers';
import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import FormData from 'form-data';
import sharp from 'sharp';
const STABILITY_API_KEY = process.env.STABILITY_API_KEY;


// Function to resize an image
async function resizeImage(imagePath, resizedDirectory) {
  const outputPath = path.join(resizedDirectory, path.basename(imagePath));
  await sharp(imagePath)
    .resize(768, 768, {
      fit: sharp.fit.inside,
      withoutEnlargement: true,
    })
    .toFile(outputPath);
  return outputPath;
}

// Function to process each image file
async function processImage(imagePath, videoDirectory, resizedDirectory) {
  const resizedImagePath = await resizeImage(imagePath, resizedDirectory);
  const data = new FormData();
  data.append('image', fs.readFileSync(resizedImagePath), path.basename(resizedImagePath));
  data.append('seed', 0);
  data.append('cfg_scale', 1.8);
  data.append('motion_bucket_id', 127);

  const response = await axios.request({
    url: 'https://api.stability.ai/v2beta/image-to-video',
    method: 'post',
    validateStatus: undefined,
    headers: {
        Authorization: `Bearer ${STABILITY_API_KEY}`,
        ...data.getHeaders(),
    },
    data: data,
  });

  console.log('Generation ID:', response.data);

  // Wait for 5 minutes before attempting to retrieve the video
  await new Promise((resolve) => setTimeout(resolve, 300000)); // 300000 ms = 5 minutes

  const responsed = await axios.request({
    url: `https://api.stability.ai/v2beta/image-to-video/result/${response.data.id}`,
    method: 'GET',
    validateStatus: undefined,
    responseType: 'arraybuffer',
    headers: {
        Authorization: `Bearer ${STABILITY_API_KEY}`,
        Accept: 'video/*', // Use 'application/json' to receive base64 encoded JSON
    },
  });

  if (responsed.status === 202) {
    console.log('Generation is still running, try again later.');
  } else if (responsed.status === 200) {
    console.log('Generation is complete!');
    const videoPath = path.join(videoDirectory, `${path.basename(imagePath, path.extname(imagePath))}.mp4`);
    fs.writeFileSync(videoPath, Buffer.from(responsed.data));
  } else {
    throw new Error(`Response ${responsed.status}: ${responsed.data.toString()}`);
  }
}

// Main function to process all images in the directory
async function processAllImages(imageDirectoryName) {
  const publicDirectory = path.resolve(process.cwd(), 'public');
  const imageDirectory = path.join(publicDirectory, imageDirectoryName);
  const videoDirectory = path.join(imageDirectory, 'videos'); // Directory to save videos
  const resizedDirectory = path.join(imageDirectory, 'resized'); // Directory to save resized images

  // Create video output directory if it doesn't exist
  if (!fs.existsSync(videoDirectory)) {
    fs.mkdirSync(videoDirectory, { recursive: true });
  }

  // Create resized image directory if it doesn't exist
  if (!fs.existsSync(resizedDirectory)) {
    fs.mkdirSync(resizedDirectory, { recursive: true });
  }

  const files = fs.readdirSync(imageDirectory);
  const imageFiles = files.filter((file) => /\.(png|jpe?g|bmp)$/i.test(file));

  for (const imageFile of imageFiles) {
    const imagePath = path.join(imageDirectory, imageFile);
    try {
      await processImage(imagePath, videoDirectory, resizedDirectory);
    } catch (error) {
      console.error(`Failed to process image ${imageFile}:`, error);
    }
  }

  return videoDirectory;
}

// export const config = {
//   api: {
//     bodyParser: {
//       sizeLimit: '10mb',
//     },
//   },
// };

export async function POST(req) {
    const body = await buffer(req.body);
    const { imageDirectoryName } = JSON.parse(body);
  
    if (!imageDirectoryName) {
      return NextResponse.json({ error: 'Image directory name is required.' }, { status: 400 });
    }
  
    try {
      const videoDirectory = await processAllImages(imageDirectoryName);
      return NextResponse.json({ message: 'Images processed successfully.', videoDirectory }, { status: 200 });
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }