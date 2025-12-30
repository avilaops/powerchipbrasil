require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const cron = require('node-cron');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const POSTS_DIR = path.join(__dirname, 'posts');
const PRODUCTS_PATH = path.join(__dirname, 'products.csv');
const DATA_DIR = path.join(__dirname, 'data');
const QUIZ_LOG = path.join(DATA_DIR, 'quiz_submissions.jsonl');

// Middleware
app.use(express.json());

// CORS - Permitir requisições do frontend
app.use((req, res, next) => {
    const allowedOrigins = [
        'https://powerchipbrasil.avila.inc',
        'https://avilaops.github.io',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Disable default index.html so our explicit '/' route serves powerchip-pro.html
app.use(express.static('.', { index: false }));
// Serve generated posts under /posts
app.use('/posts', express.static(POSTS_DIR));

// Ensure posts directory exists
const fs = require('fs');
if (!fs.existsSync(POSTS_DIR)) {
    fs.mkdirSync(POSTS_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function runPythonGenerate(type, extraArgs = []) {
    return new Promise((resolve, reject) => {
        const geradorDir = 'C:\\Users\\Administrador\\source\\repos\\Gerador';
        const args = [
            'generate_posts_cli.py',
            '--type', type,
            '--products', PRODUCTS_PATH,
            '--brand', 'Powerchip Brasil',
            '--output-dir', POSTS_DIR,
            ...extraArgs
        ];
        const proc = spawn('python', args, { cwd: geradorDir, shell: true });
        let out = '';
        let err = '';
        proc.stdout.on('data', d => { out += d.toString(); });
        proc.stderr.on('data', d => { err += d.toString(); });
        proc.on('close', code => {
            if (code === 0) {
                try {
                    const json = JSON.parse(out.trim());
                    resolve(json);
                } catch (_) {
                    resolve({ status: 'ok', detail: out.trim() });
                }
            } else {
                reject(new Error(err || out));
            }
        });
    });
}

// Config endpoint: publishable Stripe key
app.get('/config/publishable-key', (req, res) => {
    const pk = process.env.STRIPE_PUBLISHABLE_KEY || '';
    if (!pk) {
        return res.status(200).json({ publishableKey: '' });
    }
    res.json({ publishableKey: pk });
});

// Site config: analytics and support channels
app.get('/config/site', (req, res) => {
    res.json({
        whatsapp: process.env.WHATSAPP_PHONE || '',
        ga4Id: process.env.GA4_ID || '',
        metaPixelId: process.env.META_PIXEL_ID || ''
    });
});

// Endpoint para criar sessão de checkout
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { items, quiz } = req.body || {};

        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Carrinho vazio' });
        }

        // Criar line items para o Stripe
        const lineItems = items.map(item => ({
            price_data: {
                currency: 'brl',
                product_data: {
                    name: item.name,
                    description: item.description,
                },
                unit_amount: item.price, // Valor em centavos
            },
            quantity: item.quantity,
        }));

        // Normalizar metadados do quiz (opcional, mas recomendado)
        const quizMeta = {};
        if (quiz && typeof quiz === 'object') {
            const {
                brand,
                year,
                enginePowerHp,
                moreTorque,
                throttleResponse,
                reduceLag
            } = quiz;
            if (brand) quizMeta.vehicle_brand = String(brand).slice(0, 50);
            if (year) quizMeta.vehicle_year = String(year).slice(0, 10);
            if (enginePowerHp !== undefined) quizMeta.engine_power_hp = String(enginePowerHp);
            if (typeof moreTorque !== 'undefined') quizMeta.pref_more_torque = moreTorque ? 'true' : 'false';
            if (typeof throttleResponse !== 'undefined') quizMeta.pref_throttle_response = throttleResponse ? 'true' : 'false';
            if (typeof reduceLag !== 'undefined') quizMeta.pref_reduce_lag = reduceLag ? 'true' : 'false';

            // Persistir submissão para análise (append em JSONL)
            try {
                const logEntry = {
                    ts: new Date().toISOString(),
                    ...quizMeta
                };
                fs.appendFileSync(QUIZ_LOG, JSON.stringify(logEntry) + '\n');
            } catch (e) {
                console.warn('Não foi possível gravar quiz_submissions:', e.message);
            }
        }

        // Criar sessão de checkout
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'], // Apenas cartão (PIX e Boleto requerem ativação no Dashboard)
            line_items: lineItems,
            mode: 'payment',
            success_url: `${req.headers.origin}/pages/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}/pages/cancel.html`,
            locale: 'pt-BR',
            billing_address_collection: 'required',
            shipping_address_collection: {
                allowed_countries: ['BR'],
            },
            metadata: Object.keys(quizMeta).length ? quizMeta : undefined,
        });

        res.json({ id: session.id });
    } catch (error) {
        console.error('Erro ao criar sessão:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para verificar status do pagamento
app.get('/payment-status/:sessionId', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
        const md = session.metadata || {};
        const quiz = {
            brand: md.vehicle_brand || null,
            year: md.vehicle_year || null,
            enginePowerHp: md.engine_power_hp ? Number(md.engine_power_hp) : null,
            moreTorque: md.pref_more_torque === 'true',
            throttleResponse: md.pref_throttle_response === 'true',
            reduceLag: md.pref_reduce_lag === 'true',
        };
        res.json({
            status: session.payment_status,
            customerEmail: session.customer_details?.email,
            amountTotal: session.amount_total,
            quiz,
        });
    } catch (error) {
        console.error('Erro ao verificar status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Webhook para eventos do Stripe
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        return res.status(400).send('Webhook secret não configurado');
    }

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('Erro na verificação do webhook:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Processar eventos
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            console.log('Pagamento aprovado:', session.id);
            // Aqui você pode processar o pedido, enviar email, etc.
            break;

        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;
            console.log('PaymentIntent bem-sucedido:', paymentIntent.id);
            break;

        case 'payment_intent.payment_failed':
            const failedPayment = event.data.object;
            console.log('Pagamento falhou:', failedPayment.id);
            break;

        default:
            console.log(`Evento não tratado: ${event.type}`);
    }

    res.json({ received: true });
});

// Rota principal - agora servindo index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota para catálogo completo (fallback para index-old.html se existir)
app.get('/catalogo', (req, res) => {
    const legacy = path.join(__dirname, 'index-old.html');
    if (fs.existsSync(legacy)) {
        return res.sendFile(legacy);
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Posts: listar e gerar
app.get('/posts/list', async (req, res) => {
    try {
        const files = fs.readdirSync(POSTS_DIR)
            .filter(f => f.endsWith('.png') || f.endsWith('.mp4'))
            .map(f => ({ file: f, url: `/posts/${f}` }));
        res.json({ status: 'ok', files });
    } catch (e) {
        res.status(500).json({ status: 'error', detail: e.message });
    }
});

app.post('/posts/generate', async (req, res) => {
    try {
        const { type, count, duration } = req.body || {};
        if (!['static','carousel','reels'].includes(type)) {
            return res.status(400).json({ status: 'error', detail: 'type inválido' });
        }
        const extra = [];
        if (type === 'carousel' && count) extra.push('--count', String(count));
        if (type === 'reels' && duration) extra.push('--duration', String(duration));
        const result = await runPythonGenerate(type, extra);
        res.json(result);
    } catch (e) {
        res.status(500).json({ status: 'error', detail: e.message });
    }
});

// Agendamentos: Segunda 18h (static), Quarta 18h (carousel 5), Sexta 18h (reels 30s)
cron.schedule('0 18 * * 1', async () => {
    console.log('📅 [Seg 18h] Gerando post estático');
    try { await runPythonGenerate('static'); } catch (e) { console.error(e); }
});
cron.schedule('0 18 * * 3', async () => {
    console.log('📅 [Qua 18h] Gerando carrossel (5 imagens)');
    try { await runPythonGenerate('carousel', ['--count','5']); } catch (e) { console.error(e); }
});
cron.schedule('0 18 * * 5', async () => {
    console.log('📅 [Sex 18h] Gerando reels (30s)');
    try { await runPythonGenerate('reels', ['--duration','30']); } catch (e) { console.error(e); }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    const pk = (process.env.STRIPE_PUBLISHABLE_KEY || "");
    console.log(`💳 Stripe configurado com chave: ${pk ? pk.substring(0, 20) + '...' : 'NÃO DEFINIDA'}`);
    console.log('🗓️ Agendadores ativos: Seg/Qua/Sex às 18:00');
});
