require('dotenv').config();
const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const { PrismaClient, categories } = require('./generated/prisma');
const fileUpload = require('express-fileupload');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid')

const app = express();
const prisma = new PrismaClient();

const PORT = process.env.PORT || 3000;

// Express setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
    createParentPath: true,
    limits: { filesize: 10*1024*1024}
}))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
app.use('/public', express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
    res.redirect('/posts');
});

// List posts
app.get('/posts', async (req, res) => {
    const filters = req.query.filter;
    const filterList = Array.isArray(filters) ? filters : filters ? [filters] : [];
    let posts;

    if (filterList.length === 0) {
        posts = await prisma.post.findMany({
            orderBy: {createdAt: 'desc'}
        });
    }
    else {
       posts = await prisma.post.findMany({
           where: {
               category: {
                   in: filterList
               }
           }
       });

    }
    res.render('posts/index', {
        posts,
        categories: Object.values(categories),
        CATEGORY_LABELS: {
            Kleider_Accessoires: 'Kleider/Accessoires',
            M_bel: 'Möbel'
        },
        sidebar: true,
        selectedFilters: filterList
    });
});

// Create New
app.get('/posts/new', (req, res) => {
    res.render('posts/new', {
        categories: Object.values(categories),
        CATEGORY_LABELS: {
            Kleider_Accessoires: 'Kleider/Accessoires',
            M_bel: 'Möbel'
        }
    });
});
app.post('/posts', async (req, res) => {
    const { title, category, description } = req.body;

    if (!Object.values(categories).includes(category)) {
        return res.status(400).send('Ungültige Kategorie');
    }

    const newPost = await prisma.post.create({ data: {title, category, description} });

    const files = req.files && req.files.images ? req.files.images : null;
    if (files) {
        const filesArray = Array.isArray(files) ? files : [files];
        const postFolder = path.join(__dirname, 'uploads', 'posts', String(newPost.id));
        await fs.mkdir(postFolder, {recursive: true});

        const imageData = [];

        for (const file of filesArray) {
            if (!file.mimetype.startsWith('image/')) continue;

            const ext = path.extname(file.name);
            const filename = `${uuidv4()}${ext}`;
            const destPath = path.join(postFolder, filename);
            await file.mv(destPath);

            const publicPath = path.posix.join('/uploads', 'posts', String(newPost.id), filename);
            imageData.push({ path: publicPath, postId: newPost.id });
        }

        if (imageData.length > 0) {
            await prisma.image.createMany({ data: imageData })
        }
    }

    res.redirect('/posts');
})

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});