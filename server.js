const express = require("express");
const aws = require("aws-sdk");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const { aws: awsConfig, mongoURI } = require("./config");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json({ limit: "100mb" })); // Increase limit as needed
app.use(bodyParser.urlencoded({ limit: "100mb", extended: true }));

// Connect to MongoDB
mongoose
  .connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

// Define a schema and model for storing file metadata
const fileSchema = new mongoose.Schema({
  name: String,
  title: String,
  description: String,
  url: String,
});
const File = mongoose.model("File", fileSchema);

// Configure AWS S3
const s3 = new aws.S3({
  accessKeyId: awsConfig.accessKeyId,
  secretAccessKey: awsConfig.secretAccessKey,
  region: awsConfig.region,
});

// Endpoint to handle multipart upload initialization
app.post("/upload/start", async (req, res) => {
  const { name, type } = req.body;
  const params = {
    Bucket: awsConfig.bucketName,
    Key: name,
    ContentType: type,
    ACL: "public-read",
  };
  try {
    const multipart = await s3.createMultipartUpload(params).promise();
    res.json({ uploadId: multipart.UploadId });
  } catch (error) {
    console.error("Error starting multipart upload:", error);
    res.status(500).send("Server error");
  }
});

// Endpoint to handle multipart upload part
app.post("/upload/part", async (req, res) => {
  const { uploadId, partNumber, name, chunk } = req.body;
  const buffer = Buffer.from(chunk, "base64");
  const params = {
    Bucket: awsConfig.bucketName,
    Key: name,
    PartNumber: partNumber,
    UploadId: uploadId,
    Body: buffer,
  };
  try {
    const uploadPart = await s3.uploadPart(params).promise();
    res.json({ ETag: uploadPart.ETag });
  } catch (error) {
    console.error("Error uploading part:", error);
    res.status(500).send("Server error");
  }
});

// Endpoint to complete multipart upload
app.post("/upload/complete", async (req, res) => {
  const { uploadId, name, parts, title, description } = req.body;
  const params = {
    Bucket: awsConfig.bucketName,
    Key: name,
    MultipartUpload: {
      Parts: parts,
    },
    UploadId: uploadId,
  };
  try {
    const complete = await s3.completeMultipartUpload(params).promise();
    const uploadedFile = {
      name: name,
      title,
      description,
      url: complete.Location,
    };
    const savedFile = new File(uploadedFile);
    await savedFile.save();
    res.json(uploadedFile);
  } catch (error) {
    console.error("Error completing multipart upload:", error);
    res.status(500).send("Server error");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
