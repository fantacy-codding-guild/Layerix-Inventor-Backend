import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';   // added
import authRoutes from './routes/auth.routes';
import productRoutes from './routes/product.routes';
import brandRoutes from './routes/brand.routes';
import serviceCategoryRoutes from './routes/serviceCategory.routes';
import vendorRoutes from './routes/vendor.routes';
import customerRoutes from './routes/customer.routes';
import inventoryRoutes from './routes/inventory.routes';
import projectRoutes from './routes/project.routes';
import procurementRoutes from './routes/procurement.routes';
import serviceTicketRoutes from './routes/serviceTicket.routes';
import amcRoutes from './routes/amc.routes';
import reportRoutes from './routes/report.routes';
import userRoutes from './routes/user.routes';
import activityLogRoutes from './routes/activityLog.routes';

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());   // added – now req.cookies is available

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/service-categories', serviceCategoryRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', procurementRoutes);
app.use('/api/service-tickets', serviceTicketRoutes);
app.use('/api/amcs', amcRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.get('/api/health', (_, res) => res.json({ status: 'OK' }));

export default app;