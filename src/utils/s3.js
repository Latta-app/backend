import dotenv from 'dotenv';
import { Upload } from '@aws-sdk/lib-storage';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

dotenv.config();

const s3 = new S3Client({
  region: 'sa-east-1',
  credentials: {
    accessKeyId: process.env.AWS_BUCKET_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_BUCKET_SECRET_ACCESS_KEY,
  },
});

const uploadFile = async ({ bucketName, filePath, fileStream, contentType }) => {
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucketName,
      Key: filePath,
      Body: fileStream,
      ContentType: contentType,
    },
  });

  const s3ReturnObj = await upload.done().then((res) => {
    return {
      url: res.Location,
      key: res.Key,
    };
  });

  return s3ReturnObj;
};

const getObjectSignedUrl = async ({ bucketName, key, expiresIn = 3600 * 24 }) => {
  const params = {
    Bucket: bucketName,
    Key: key,
  };

  const command = new GetObjectCommand(params);

  const url = await getSignedUrl(s3, command, { expiresIn });

  return url;
};

export default {
  uploadFile,
  getObjectSignedUrl,
};
