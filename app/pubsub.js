const { PubSub } = require('@google-cloud/pubsub');

// Fonction pour publier les tags dans un topic Pub/Sub
async function publishTagsToPubSub(tags, topicName = 'dmii2-5', projectId = 'dmii-2024') {
  const pubSubClient = new PubSub({ projectId }); // Instanciation du client Pub/Sub avec le projectId
  const dataBuffer = Buffer.from(JSON.stringify({ tags })); // Conversion des tags en buffer

  try {
    // Publier le message dans le topic
    const messageId = await pubSubClient.topic(topicName).publish(dataBuffer);
    console.log(`Message ${messageId} publié dans le topic "${topicName}" avec les tags: ${tags}`);
    return messageId;
  } catch (error) {
    console.error(`Erreur lors de la publication des tags dans Pub/Sub: ${error.message}`);
    throw error;
  }
}

module.exports = {
  publishTagsToPubSub
};
