require('dotenv').config();
const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const { PrismaClient } = require('./generated/prisma');

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
    const posts = await prisma.post.findMany({
        orderBy: { createdAt: 'desc' }
    });
    res.render('posts/index', { posts });
});


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});