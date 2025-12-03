require('dotenv').config();
const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const { PrismaClient, categories, increments } = require('./generated/prisma');
const fileUpload = require('express-fileupload');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();
const prisma = new PrismaClient();

const PORT = process.env.PORT || 3000;

const INCREMENT_VALUES = {
    ONE: 1,
    FIVE: 5,
    TEN: 10,
    FIFTY: 50,
    HUNDRED: 100,
    FIVEHUNDRED: 500,
    THOUSAND: 1000
};

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
    res.locals.currentUser = req.session.userId ? { id: req.session.userId, username: req.session.username } : null;
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
    const { email, username, password} = req.body;

    // Basic validation
    if (!email || !password || !username) {
        return res.render('auth/register', { error: 'Email, password and username required' });
    }

    if (username.length > 15) {
        return res.render('auth/register', { error: 'Username can\'t be longer than 15 characters' });
    }

    if (password.length < 6) {
        return res.render('auth/register', { error: 'Password must be at least 6 characters' });
    }

    try {
        // Check if email exists
        const existingUserEmail = await prisma.user.findUnique({ where: { email } });
        if (existingUserEmail) {
            return res.render('auth/register', { error: 'Email already registered' });
        }

        // Check if username exists
        const existingUserUsername = await prisma.user.findUnique({ where: { username } });
        if (existingUserUsername) {
            return res.render('auth/register', { error: 'Username already exists, please choose another one' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const user = await prisma.user.create({
            data: { email, username, passwordHash}
        });

        // Auto-login after registration
        req.session.userId = user.id;
        req.session.username = user.username;
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
        req.session.username = user.username;
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

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7*24*60*60*1000);

    let posts;
    if (filterList.length === 0) {
        posts = await prisma.post.findMany({
            where: {
                OR: [
                    { endsAt: null },
                    { endsAt: { gt: oneWeekAgo } }
                ]
            },
            orderBy: { createdAt: 'desc' }
        });
    } else {
        posts = await prisma.post.findMany({
            where: {
                category: { in: filterList },
                OR: [
                    { endsAt: null },
                    { endsAt: { gt: oneWeekAgo } }
                ]
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
        selectedFilters: filterList,
        layout: req.xhr ? false : 'layout'
    });
});

// view specific post
app.get('/posts/view/:id', async (req, res) => {
    const id = Number(req.params.id);
    const post = await prisma.post.findUnique({
        where: {id},
        include: {
            images: true,
            User: true,
            bids: { orderBy: {
                    createdAt: "desc"
                },
                include: {
                    User: true
                }
            }
        }
    });
    if (!post) return res.status(404).send('Post not found');

    const now = new Date();
    const hasEnded = post.endsAt && post.endsAt < now;

    if (hasEnded && post.buyerId && !post.isSold) {
        await prisma.post.update({
            where: { id: post.id },
            data: {
                isSold: true
            }
        });
        post.isSold = true;
    }

    const increment = INCREMENT_VALUES[post.increment];
    const bidCount = post.bids.length;
    const isFirstBid = bidCount === 0;

    const currentBid = isFirstBid ? null : post.currentPrice;
    const nextBid = isFirstBid ? post.startingPrice : (post.currentPrice ?? post.startingPrice) + increment;

    const highestBid = post.bids[0];
    const userHasHighestBid = !!(highestBid && req.session.userId && highestBid.userId === Number(req.session.userId));

    res.render('posts/view', {
        post,
        hasEnded,
        currentBid,
        nextBid,
        bidCount,
        userHasHighestBid,
        CATEGORY_LABELS: {
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
        },
        increments: Object.values(increments),
        INCREMENT_VALUES: {
            ONE: 1,
            FIVE: 5,
            TEN: 10,
            FIFTY: 50,
            HUNDRED: 100,
            FIVEHUNDRED: 500,
            THOUSAND: 1000
        }
    });
});

// post new
app.post('/posts', requireAuth, async (req, res) => {
    const { title, category, description, startingPrice, buyNowPrice, increment } = req.body;

    if (!Object.values(categories).includes(category)) {
        return res.status(400).send('Ungültige Kategorie');
    }

    if (!Object.values(increments).includes(increment)) {
        return res.status(400).send('Ungültiges Inkrement')
    }

    const endDate = new Date();
    endDate.setDate(endDate.getDate() +10);

    const newPost = await prisma.post.create( {
        data: {
            title, category, description,
            startingPrice: parseFloat(startingPrice),
            userId: req.session.userId,
            buyNowPrice: buyNowPrice ? parseFloat(buyNowPrice) : null,
            endsAt: endDate,
            increment
        }
    } );

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

// bid
app.post('/posts/bid/:id', requireAuth, async (req, res) => {
    const postId = Number(req.params.id);
    const userId = Number(req.session.userId);

    const post = await prisma.post.findUnique({
        where: { id: postId },
        include: {
            images: true,
            User: true,
            bids: { orderBy: { createdAt: 'desc' }, include: { User: true } }
        }
    });

    const now = new Date();
    const hasEnded = post.endsAt && post.endsAt < now;

    if (post.userId === userId) {
        return res.render('posts/view', {
            post,
            hasEnded,
            currentBid: post.currentPrice ?? null,
            nextBid: (post.currentPrice ?? post.startingPrice) + INCREMENT_VALUES[post.increment],
            bidCount: post.bids.length,
            userHasHighestBid: false,
            CATEGORY_LABELS: {
                Kleider_Accessoires: 'Kleider/Accessoires',
                M_bel: 'Möbel'
            },
            error: "Du kannst nicht auf dein eigenes Angebot bieten"
        });
    }

    const highestBid = post.bids[0];
    const userHasHighestBid = !!(highestBid && highestBid.userId === userId);

    if (userHasHighestBid) {
        return res.render('posts/view', {
            post,
            hasEnded,
            currentBid: post.currentPrice ?? null,
            nextBid: (post.currentPrice ?? post.startingPrice) + INCREMENT_VALUES[post.increment],
            bidCount: post.bids.length,
            userHasHighestBid: true,
            CATEGORY_LABELS: {
                Kleider_Accessoires: 'Kleider/Accessoires',
                M_bel: 'Möbel'
            },
            error: "Du hast bereits das höchste Gebot"
        });
    }

    const increment = INCREMENT_VALUES[post.increment];
    const isFirstBid = post.currentPrice === null;
    const newBidAmount = isFirstBid ? post.startingPrice : post.currentPrice + increment;

    let newEndsAt = post.endsAt;
    if (post.endsAt && post.endsAt - now <= 60000) {
        newEndsAt = new Date(now.getTime() + 60000);
    }

    await prisma.$transaction([
        prisma.bid.create({
            data: { amount: newBidAmount, userId, postId }
        }),
        prisma.post.update({
            where: { id: postId },
            data: {
                currentPrice: newBidAmount,
                buyerId: userId,
                endsAt: newEndsAt
            }
        })
    ]);

    res.redirect(`/posts/view/${postId}`);
})

//profile page
app.get('/profile', requireAuth, async (req, res) => {
    const userId = Number(req.session.userId);
    const now = new Date();

    // posts the user has placed bids on, excluding already sold posts
    const biddingOn = await prisma.post.findMany({
        where: {
            bids: { some: { userId } },
            OR: [
                { endsAt: { gt: now } },  // still active
                { endsAt: null }          // maybe no end date
            ]
        },
        include: {
            images: true,
            bids: { orderBy: { createdAt: 'desc' }, include: { User: true } },
            User: true
        },
        orderBy: { createdAt: 'desc' }
    });

    // posts the user has bought, only ended and sold
    const bought = await prisma.post.findMany({
        where: {
            buyerId: userId,
            isSold: true,
            endsAt: { lte: now }  // auction ended
        },
        include: {
            images: true,
            bids: { orderBy: { createdAt: 'desc' }, include: { User: true } },
            User: true
        },
        orderBy: { endsAt: 'desc' }
    });

    // posts the user is selling
    const selling = await prisma.post.findMany({
        where: { userId },
        include: {
            images: true,
            bids: { orderBy: { createdAt: 'desc' }, include: { User: true } },
            User: true
        },
        orderBy: { createdAt: 'desc' }
    });

    res.render('profile', {
        biddingOn,
        bought,
        selling,
        CATEGORY_LABELS: {
            Kleider_Accessoires: 'Kleider/Accessoires',
            M_bel: 'Möbel'
        }
    });
});

// edit page
app.get('/posts/:id/edit', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const userId = Number(req.session.userId);
    const now = new Date();

    const post = await prisma.post.findUnique({
        where: { id },
        include: {
            images: true
        }
    });

    if (!post) return res.status(404).send('Beitrag nicht gefunden');

    // only owner can edit
    if (post.userId !== userId) {
        return res.status(403).send('Nicht berechtigt');
    }

    // only editable if active (not sold and not ended)
    const hasEnded = post.endsAt && post.endsAt < now;
    if (post.isSold || hasEnded) {
        return res.status(400).send('Dieser Beitrag kann nicht mehr bearbeitet werden');
    }

    res.render('posts/edit', {
        post,
        categories: Object.values(categories),
        CATEGORY_LABELS: {
            Kleider_Accessoires: 'Kleider/Accessoires',
            M_bel: 'Möbel'
        }
    });
});

// update post
app.post('/posts/:id', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const { title, description, category } = req.body;
    const now = new Date();

    const hasEnded = post.endsAt && post.endsAt < now;
    if (post.isSold || hasEnded) {
        return res.status(400).send('Dieser Beitrag kann nicht mehr bearbeitet werden');
    }

    if (category && !Object.values(categories).includes(category)) {
        return res.status(400).send('Ungültige Kategorie');
    }

    await prisma.post.update({
        where: { id },
        data: {
            title,
            description,
            category,
            updatedAt: new Date()
        }
    });

    const files = req.files && req.files.images ? req.files.images : null;
    if (files) {
        const filesArray = Array.isArray(files) ? files : [files];
        const postFolder = path.join(__dirname, 'uploads', 'posts', String(id));
        await fs.mkdir(postFolder, { recursive: true });

        const imageData = [];

        for (const file of filesArray) {
            if (!file.mimetype.startsWith('image/')) continue;
            const ext = path.extname(file.name);
            const filename = `${uuidv4()}${ext}`;
            const destPath = path.join(postFolder, filename);
            await file.mv(destPath);

            const publicPath = path.posix.join('/uploads', 'posts', String(id), filename);
            imageData.push({ path: publicPath, postId: id });
        }

        if (imageData.length > 0) {
            await prisma.image.createMany({ data: imageData });
            await prisma.post.update({
                where: { id },
                data: { updatedAt: new Date() }
            });
        }
    }

    res.redirect('/profile');
});

// repost page
app.get('/posts/:id/repost', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const userId = Number(req.session.userId);
    const now = new Date();

    const post = await prisma.post.findUnique({ where: { id }, include: { images: true } });
    if (!post) return res.status(404).send('Beitrag nicht gefunden');
    if (post.userId !== userId) return res.status(403).send('Nicht berechtigt');

    const hasEnded = post.endsAt && post.endsAt < now;
    if (!hasEnded || post.isSold) return res.status(400).send('Nur abgelaufene, nicht verkaufte Beiträge können erneut hochgeladen werden');

    res.render('posts/repost', {
        post,
        categories: Object.values(categories),
        increments: Object.values(increments),
        INCREMENT_VALUES,
        CATEGORY_LABELS: { Kleider_Accessoires: 'Kleider/Accessoires', M_bel: 'Möbel' }
    });
});

// repost
app.post('/posts/:id/repost', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const userId = Number(req.session.userId);
    const { title, description, category, startingPrice, buyNowPrice, increment } = req.body;

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) return res.status(404).send('Beitrag nicht gefunden');
    if (post.userId !== userId) return res.status(403).send('Nicht berechtigt');

    const now = new Date();
    const hasEnded = post.endsAt && post.endsAt < now;
    if (!hasEnded || post.isSold) return res.status(400).send('Nur abgelaufene, nicht verkaufte Beiträge können erneut hochgeladen werden');

    const newEndsAt = new Date();
    newEndsAt.setDate(now.getDate() + 10);

    await prisma.post.update({
        where: { id },
        data: {
            title,
            description,
            category,
            startingPrice: parseFloat(startingPrice),
            buyNowPrice: buyNowPrice ? parseFloat(buyNowPrice) : null,
            increment,
            createdAt: now,
            updatedAt: now,
            endsAt: newEndsAt,
            isSold: false,
            currentPrice: null,
            buyerId: null
        }
    });

    const files = req.files && req.files.images ? (Array.isArray(req.files.images) ? req.files.images : [req.files.images]) : [];
    if (files.length > 0) {
        const postFolder = path.join(__dirname, 'uploads', 'posts', String(post.id));
        await fs.mkdir(postFolder, { recursive: true });

        const imageData = [];
        for (const file of files) {
            if (!file.mimetype.startsWith('image/')) continue;
            const ext = path.extname(file.name);
            const filename = `${uuidv4()}${ext}`;
            const destPath = path.join(postFolder, filename);
            await file.mv(destPath);
            const publicPath = path.posix.join('/uploads', 'posts', String(post.id), filename);
            imageData.push({ path: publicPath, postId: post.id });
        }
        if (imageData.length > 0) await prisma.image.createMany({ data: imageData });
    }

    res.redirect('/profile');
});


// Bezahlprozess
// 1) Käufer bestätigt Zahlung
app.post('/posts/:id/confirm-payment', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const userId = Number(req.session.userId);

    const post = await prisma.post.findUnique({ where: { id }, select: { buyerId: true, transactionStatus: true } });
    if (!post) return res.status(404).send('Beitrag nicht gefunden');
    if (post.buyerId !== userId) return res.status(403).send('Nur der Käufer kann die Zahlung bestätigen');

    if (post.transactionStatus !== 'PENDING') {
        return res.redirect(`/posts/view/${id}`);
    }

    await prisma.post.update({
        where: { id },
        data: {
            transactionStatus: 'PAYMENT_CONFIRMED_BY_BUYER',
            transactionUpdatedAt: new Date()
        }
    });

    res.redirect(`/posts/view/${id}`);
});

// 2) Verkäufer bestätigt Zahlung erhalten & Versand
app.post('/posts/:id/confirm-payment-received-and-shipped', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const userId = Number(req.session.userId);

    const post = await prisma.post.findUnique({ where: { id }, select: { userId: true, transactionStatus: true } });
    if (!post) return res.status(404).send('Beitrag nicht gefunden');
    if (post.userId !== userId) return res.status(403).send('Nur der Verkäufer kann diese Aktion ausführen');

    if (post.transactionStatus !== 'PAYMENT_CONFIRMED_BY_BUYER') {
        return res.redirect(`/posts/view/${id}`);
    }

    await prisma.post.update({
        where: { id },
        data: {
            transactionStatus: 'PAYMENT_RECEIVED_AND_SHIPPED',
            transactionUpdatedAt: new Date()
        }
    });

    res.redirect(`/posts/view/${id}`);
});

// 3) Käufer bestätigt Erhalt -> Transaktion abschliessen
app.post('/posts/:id/confirm-received', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const userId = Number(req.session.userId);

    const post = await prisma.post.findUnique({ where: { id }, select: { buyerId: true, transactionStatus: true } });
    if (!post) return res.status(404).send('Beitrag nicht gefunden');
    if (post.buyerId !== userId) return res.status(403).send('Nur der Käufer kann den Erhalt bestätigen');

    if (post.transactionStatus !== 'PAYMENT_RECEIVED_AND_SHIPPED') {
        return res.redirect(`/posts/view/${id}`);
    }

    await prisma.post.update({
        where: { id },
        data: {
            transactionStatus: 'RECEIVED_CONFIRMED',
            transactionUpdatedAt: new Date(),
            isSold: true
        }
    });

    res.redirect(`/posts/view/${id}`);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});