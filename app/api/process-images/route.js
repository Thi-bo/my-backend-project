// process-images.js
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import FormData from "form-data";
import sharp from "sharp";

const STABILITY_API_KEY = process.env.STABILITY_API_KEY;

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

async function processImage(imagePath, videoDirectory, resizedDirectory) {
  const resizedImagePath = await resizeImage(imagePath, resizedDirectory);

  const data = new FormData();
  data.append("image", fs.readFileSync(resizedImagePath), path.basename(resizedImagePath));
  data.append("seed", 0);
  data.append("cfg_scale", 1.8);
  data.append("motion_bucket_id", 127);

  const response = await axios.request({
    url: `https://api.stability.ai/v2beta/image-to-video`,
    method: "post",
    validateStatus: undefined,
    headers: {
      authorization: `Bearer ${STABILITY_API_KEY}`,
      ...data.getHeaders(),
    },
    data: data,
  });

  console.log("Generation ID:", response.data);

  // Wait for 5 minutes before attempting to retrieve the video
  await new Promise((resolve) => setTimeout(resolve, 300000)); // 300000 ms = 5 minutes

  let retry = true;
  let attempt = 0;
  const maxAttempts = 5;

  while (retry && attempt < maxAttempts) {
    attempt++;
    const responsed = await axios.request({
      url: `https://api.stability.ai/v2beta/image-to-video/result/${response.data.id}`,
      method: "GET",
      validateStatus: undefined,
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${STABILITY_API_KEY}`,
        Accept: "video/*", // Use 'application/json' to receive base64 encoded JSON
      },
    });

    if (responsed.status === 202) {
      console.log("Generation is still running, try again later.");
      await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 1 minute before retrying
    } else if (responsed.status === 200) {
      console.log("Generation is complete!");
      const videoPath = path.join(videoDirectory, `${path.basename(imagePath, path.extname(imagePath))}.mp4`);
      fs.writeFileSync(videoPath, Buffer.from(responsed.data));
      retry = false;
    } else {
      throw new Error(`Response ${responsed.status}: ${responsed.data.toString()}`);
    }
  }

  if (retry) {
    throw new Error("Failed to retrieve the video after multiple attempts.");
  }
}

async function processAllImages(imageDirectory) {
  const videoDirectory = path.join(imageDirectory, "videos"); // Directory to save videos
  const resizedDirectory = path.join(imageDirectory, "resized"); // Directory to save resized images

  // Create video output directory if it doesn't exist
  if (!fs.existsSync(videoDirectory)) {
    fs.mkdirSync(videoDirectory, { recursive: true });
  }

  // Create resized image directory if it doesn't exist
  if (!fs.existsSync(resizedDirectory)) {
    fs.mkdirSync(resizedDirectory, { recursive: true });
  }

  const files = fs.readdirSync(imageDirectory);
  const imageFiles = files.filter(file => /\.(png|jpe?g|bmp)$/i.test(file));

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

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { directory } = req.body;

    if (!directory) {
      return res.status(400).json({ error: 'Directory path is required.' });
    }

    try {
      const videoDirectory = await processAllImages(directory);
      res.status(200).json({ message: 'Images processed successfully.', videoDirectory });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
