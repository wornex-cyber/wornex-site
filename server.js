import express from 'express';
import 'dotenv/config';
const app=express();
app.use(express.json());
app.use(express.static('.'));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'VORNEX'}));
app.get('/api/config-status',(req,res)=>res.json({apiConfigured:Boolean(process.env.SMS_ONAY_API_KEY),paymentConfigured:Boolean(process.env.PAYMENT_SECRET)}));
app.listen(process.env.PORT||3000,()=>console.log('VORNEX: http://localhost:'+ (process.env.PORT||3000)));
