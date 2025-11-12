require('dotenv').config();
const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const { PrismaClient, categories } = require('./generated/prisma');

const app = express();
const prisma = new PrismaClient();

const PORT = process.env.PORT || 3000;

// Express setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.use(express.urlencoded({ extended: true }));
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

    await prisma.post.create({ data: {title, category, description} });
    res.redirect('/posts');
})

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});