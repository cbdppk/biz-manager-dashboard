# Deployment Notes

This project can be deployed to Vercel as a portfolio demo.

## Recommended Deployment Safety

- Use a separate demo database
- Use fictional sample data only
- Do not connect production or private databases
- Add environment variables through the Vercel dashboard
- Never commit `.env` files
- Review the deployed site before sharing it publicly

## Basic Steps

1. Import the GitHub repo into Vercel
2. Configure the frontend and backend build settings for the split app structure
3. Add required environment variables in the Vercel dashboard
4. Run the build
5. Test the deployed demo with fictional sample data
6. Add the deployed link to the GitHub repo website field only after review
