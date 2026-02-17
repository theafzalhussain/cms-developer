const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Folder structure check for uploads
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) { 
    fs.mkdirSync(uploadDir, { recursive: true }); 
}

// ==================== DATABASE CONNECTION ====================
// Aapka provided MongoDB URI
const MONGO_URI = "mongodb+srv://theafzalhussain_db:afzal786@cluster0.6fv3ww8.mongodb.net/ContentFlow?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log("☁️ Cloud DB Connected Successfully!"))
    .catch((err) => console.error("❌ DB Connection Error:", err));

// ==================== SCHEMAS & MODELS ====================
const UserSchema = new mongoose.Schema({
    name: String,
    username: { type: String, unique: true },
    password: { type: String },
    role: { type: String, default: 'Administrator' },
    profilePic: { type: String, default: '' }
});

const ContentSchema = new mongoose.Schema({
    title: String, 
    content: String, 
    author: String,
    status: String, 
    category: String, 
    type: String, // 'pages' or 'posts'
    date: { type: String, default: () => new Date().toISOString().split('T')[0] }
});

const MediaSchema = new mongoose.Schema({
    name: String, 
    type: String, 
    size: String, 
    url: String,
    date: { type: String, default: () => new Date().toISOString().split('T')[0] }
});

const User = mongoose.model('User', UserSchema);
const Page = mongoose.model('Page', ContentSchema);
const Post = mongoose.model('Post', ContentSchema);
const Media = mongoose.model('Media', MediaSchema);

// ==================== MIDDLEWARES ====================
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(uploadDir));

// Multer Configuration for File Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ==================== ROUTES ====================

// --- AUTH: Login ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username, password });
        if (user) {
            res.json({ 
                success: true, 
                user: { 
                    id: user._id, 
                    name: user.name, 
                    role: user.role, 
                    profilePic: user.profilePic, 
                    username: user.username 
                } 
            });
        } else { 
            res.status(401).json({ success: false, message: "Invalid credentials" }); 
        }
    } catch (e) { 
        res.status(500).json({ success: false, error: "Server error" }); 
    }
});

// --- FETCH DATA: Generic Fetch for all types ---
app.get('/api/:type', async (req, res) => {
    try {
        let data;
        const type = req.params.type;
        if (type === 'users') data = await User.find();
        else if (type === 'media') data = await Media.find();
        else if (type === 'pages') data = await Page.find();
        else if (type === 'posts') data = await Post.find();
        else return res.status(404).json({ error: "Invalid type" });

        // Mapping _id to id for frontend compatibility
        res.json(data.map(d => ({ ...d._doc, id: d._id })));
    } catch (e) { 
        res.status(500).json([]); 
    }
});

// --- PROFILE: Update Name ---
app.patch('/api/users/:id', async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { name: req.body.name });
        res.json({ success: true });
    } catch (e) { 
        res.status(500).json({ error: "Update failed" }); 
    }
});

// --- SECURITY: Update Username/Password ---
app.patch('/api/users/:id/security', async (req, res) => {
    try {
        const { username, password } = req.body;
        const updateData = {};
        if (username) updateData.username = username;
        if (password) updateData.password = password;
        
        await User.findByIdAndUpdate(req.params.id, updateData);
        res.json({ success: true });
    } catch (e) { 
        res.status(500).json({ error: "Security update failed" }); 
    }
});

// --- MEDIA: Update Media Info ---
app.patch('/api/media/:id', async (req, res) => {
    try {
        const { name, type } = req.body;
        await Media.findByIdAndUpdate(req.params.id, { name, type });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Media update failed" });
    }
});

// --- CONTENT: Create Page ---
app.post('/api/pages', async (req, res) => {
    try { 
        const n = new Page(req.body); 
        await n.save(); 
        res.status(201).json(n); 
    } catch (e) { 
        res.status(500).send(); 
    }
});

// --- CONTENT: Create Post ---
app.post('/api/posts', async (req, res) => {
    try { 
        const n = new Post(req.body); 
        await n.save(); 
        res.status(201).json(n); 
    } catch (e) { 
        res.status(500).send(); 
    }
});

// --- UPLOAD: Generic Media Upload ---
app.post('/api/media/upload', upload.single('file'), async (req, res) => {
    try {
        const m = new Media({
            name: req.body.name || req.file.originalname,
            type: req.body.type,
            size: (req.file.size / 1024).toFixed(2) + " KB",
            url: `/uploads/${req.file.filename}`
        });
        await m.save();
        res.json(m);
    } catch (e) { 
        res.status(500).json({ error: "Upload failed" }); 
    }
});

// --- UPLOAD: User Profile Picture (Avatar) ---
app.post('/api/users/:id/avatar', upload.single('file'), async (req, res) => {
    try {
        const url = `/uploads/${req.file.filename}`;
        await User.findByIdAndUpdate(req.params.id, { profilePic: url });
        res.json({ success: true, url });
    } catch (e) { 
        res.status(500).json({ error: "Avatar upload failed" }); 
    }
});

// --- DELETE: Generic Delete by ID ---
app.delete('/api/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        if (type === 'users') await User.findByIdAndDelete(id);
        else if (type === 'media') {
            const item = await Media.findById(id);
            // Optional: Delete physical file from folder
            if(item && item.url) {
                const filePath = path.join(__dirname, 'public', item.url);
                if(fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
            await Media.findByIdAndDelete(id);
        }
        else if (type === 'pages') await Page.findByIdAndDelete(id);
        else if (type === 'posts') await Post.findByIdAndDelete(id);
        
        res.json({ success: true });
    } catch (e) { 
        res.status(500).json({ error: "Delete failed" }); 
    }
});

// Server Initialization
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});