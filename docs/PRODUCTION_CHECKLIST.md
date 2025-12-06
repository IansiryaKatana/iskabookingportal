# Production Deployment Checklist

Use this checklist before deploying to production. Check off each item as you complete it.

## Pre-Deployment

### Environment Configuration
- [ ] All environment variables configured in `.env.local`
- [ ] Supabase edge function secrets set via CLI or dashboard
- [ ] `.env.example` file reviewed and matches production needs
- [ ] No sensitive keys committed to version control
- [ ] Production Supabase project created and configured
- [ ] Production Stripe account configured (switch from test to live keys)
- [ ] Production DocuSign account configured
- [ ] Production Resend account configured

### Database
- [ ] All migrations run in production database
- [ ] Database backup configured and tested
- [ ] RLS policies verified and tested
- [ ] Indexes created and optimized
- [ ] Seed data loaded (if applicable)
- [ ] Database connection tested

### Edge Functions
- [ ] All edge functions deployed to production
- [ ] Edge function secrets configured
- [ ] Edge functions tested individually
- [ ] Webhook endpoints configured (Stripe, DocuSign)
- [ ] Error handling verified in edge functions

### Frontend
- [ ] Production build successful (`npm run build`)
- [ ] No console errors in production build
- [ ] Environment variables prefixed with `VITE_` where needed
- [ ] CORS configured for production domain
- [ ] CDN/hosting configured

## Deployment

### Scheduled Jobs
- [ ] Cron job configured (GitHub Actions, Vercel Cron, or pg_cron)
- [ ] `release-expired-reservations` scheduled and tested
- [ ] Cron job tested manually
- [ ] Monitoring/alerting set up for cron failures

### Monitoring & Error Tracking
- [ ] Sentry configured (if using)
- [ ] Error tracking tested
- [ ] Uptime monitoring configured
- [ ] Log aggregation set up
- [ ] Alerts configured for critical failures

### Security
- [ ] HTTPS enabled
- [ ] CORS restricted to production domain
- [ ] Service role key secured (never in frontend)
- [ ] Rate limiting configured (if applicable)
- [ ] Security headers configured
- [ ] RLS policies tested

## Post-Deployment

### Functional Testing
- [ ] User registration works
- [ ] User login works
- [ ] Studio catalog displays correctly
- [ ] Application wizard functions properly
- [ ] Payment processing works (test with real card in test mode first)
- [ ] Document upload works
- [ ] Email notifications sent successfully
- [ ] Admin portal accessible and functional
- [ ] Partner portal accessible and functional
- [ ] Student portal accessible and functional

### Integration Testing
- [ ] Stripe webhook receives events
- [ ] DocuSign integration works
- [ ] Email delivery works
- [ ] Scheduled jobs running
- [ ] Database backups working

### Performance
- [ ] Page load times acceptable (< 3s)
- [ ] Images optimized
- [ ] Database queries performant
- [ ] Edge functions respond quickly (< 2s)
- [ ] No memory leaks detected

### Documentation
- [ ] Deployment guide reviewed
- [ ] Team trained on new system
- [ ] Support contacts documented
- [ ] Rollback procedure documented

## Go-Live

### Final Checks
- [ ] All checklist items completed
- [ ] Stakeholders notified
- [ ] Support team ready
- [ ] Monitoring dashboards accessible
- [ ] Backup and restore procedure tested

### Launch
- [ ] Deploy to production
- [ ] Verify deployment successful
- [ ] Run smoke tests
- [ ] Monitor error rates
- [ ] Monitor performance metrics

### Post-Launch (First 24 Hours)
- [ ] Monitor error logs hourly
- [ ] Check payment processing
- [ ] Verify email delivery
- [ ] Monitor scheduled jobs
- [ ] Review user feedback
- [ ] Check system performance

## Rollback Plan

If critical issues occur:

1. **Frontend Rollback**
   - Revert to previous deployment in hosting provider
   - Verify rollback successful

2. **Edge Functions Rollback**
   ```bash
   supabase functions deploy <function-name> --version <previous-version>
   ```

3. **Database Rollback**
   - Restore from backup if needed
   - Run rollback migrations if applicable

4. **Environment Variables**
   - Revert to previous values
   - Restart services

## Support Contacts

- **Technical Lead:** [Name/Email]
- **DevOps:** [Name/Email]
- **Database Admin:** [Name/Email]
- **Stripe Support:** [Contact]
- **DocuSign Support:** [Contact]
- **Supabase Support:** [Contact]

## Emergency Contacts

- **On-Call Engineer:** [Phone]
- **Project Manager:** [Phone]
- **CTO:** [Phone]

---

**Last Updated:** 2025-11-20  
**Next Review:** After each major deployment

