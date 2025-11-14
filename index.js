require('dotenv').config();
const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const { PrismaClient, categories } = require('./generated/prisma');
const fileUpload = require('express-fileupload');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();
const prisma = new PrismaClient();

const PORT = process.env.PORT || 3000;

// express setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.use(express.urlencoded({ extended: true }));
// fileuploads
app.use(fileUpload({
    createParentPath: true,
    limits: { filesize: 10*1024*1024}
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
//public folder
app.use('/public', express.static(path.join(__dirname, 'public')));
// user setup and session configuration
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
}))
// make currentUser available to all views
app.use((req, res, next) => {
    res.locals.currentUser = req.session.userId ? { id: req.session.userId } : null;
    next();
});

// requre authentication middleware
const requireAuth = async (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect ('/login')
    }
    next();
};


// Routes
app.get('/', (req, res) => {
    res.redirect('/posts');
});

// authentication routes
// Registration
app.get('/register', (req, res) => {
    res.render('auth/register');
});

app.post('/register', async (req, res) => {
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
        return res.render('auth/register', { error: 'Email and password required' });
    }

    if (password.length < 6) {
        return res.render('auth/register', { error: 'Password must be at least 6 characters' });
    }

    try {
        // Check if user exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.render('auth/register', { error: 'Email already registered' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const user = await prisma.user.create({
            data: { email, passwordHash }
        });

        // Auto-login after registration
        req.session.userId = user.id;
        res.redirect('/posts');
    } catch (error) {
        res.render('auth/register', { error: 'Registration failed' });
    }
});

// Login
app.get('/login', (req, res) => {
    res.render('auth/login');
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.render('auth/login', { error: 'Email and password required' });
    }

    try {
        // Find user
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.render('auth/login', { error: 'Invalid email or password' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
            return res.render('auth/login', { error: 'Invalid email or password' });
        }

        // Set session
        req.session.userId = user.id;
        res.redirect('/posts');
    } catch (error) {
        res.render('auth/login', { error: 'Login failed' });
    }
});

// Logout
app.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});


// list posts
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

// view specific post
app.get('/posts/view/:id', async (req, res) => {
    const id = Number(req.params.id);
    const post = await prisma.post.findUnique({
        where: {id},
        include: {images: true}
    });
    if (!post) return res.status(404).send('Post not found');
    res.render('posts/view', {
        post, CATEGORY_LABELS: {
            Kleider_Accessoires: 'Kleider/Accessoires',
            M_bel: 'Möbel'
        }
    });
});

// create new
app.get('/posts/new', requireAuth, (req, res) => {
    res.render('posts/new', {
        categories: Object.values(categories),
        CATEGORY_LABELS: {
            Kleider_Accessoires: 'Kleider/Accessoires',
            M_bel: 'Möbel'
        }
    });
});

// post new
app.post('/posts', requireAuth, async (req, res) => {
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