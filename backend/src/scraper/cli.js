const { getProductMetadata, scrapeLiveOffer } = require('./index');

async function main() {
  const args = process.argv.slice(2);
  const hasHeadedFlag = args.includes('--headed');
  const cleanedArgs = args.filter((arg) => arg !== '--headed');

  const productId = cleanedArgs[0] || '2568';
  const option = cleanedArgs[1] || null;

  try {
    const metadata = await getProductMetadata(productId);
    console.log('Product metadata:', JSON.stringify(metadata, null, 2));

    const result = await scrapeLiveOffer({
      productId,
      option,
      config: {
        headed: hasHeadedFlag,
      },
    });

    console.log('Live offer result:', JSON.stringify(result, null, 2));

    if (!result.success) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Scraper failed:', error.message);
    process.exitCode = 1;
  }
}

main();
