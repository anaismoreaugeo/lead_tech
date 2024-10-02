const { PubSub } = require('@google-cloud/pubsub');
const { Storage } = require('@google-cloud/storage');
const archiver = require('archiver');
const fetch = require('node-fetch');
const moment = require('moment');
const photoModel = require('./photo_model'); // Assurez-vous que cette fonction existe et fonctionne

// Stocker l'état des jobs (global variable)
let jobsStatus = {};

// Instanciation du client Google Cloud Storage
const storage = new Storage();

// Fonction pour ajouter un délai
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fonction pour télécharger une image avec gestion des tentatives de réessai
async function downloadImageWithRetry(url, retries = 3, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      return response.buffer(); // Retourner l'image sous forme de buffer
    } catch (error) {
      if (error.response && error.response.status === 429 && i < retries - 1) {
        console.warn(`Limite de taux atteinte. Nouvelle tentative dans ${delayMs}ms...`);
        await delay(delayMs); // Attendre avant la prochaine tentative
      } else {
        throw error;
      }
    }
  }
  throw new Error('Échec après plusieurs tentatives.');
}

// Fonction pour zipper et uploader dans Google Cloud Storage
async function zipAndUpload(tags) {
  try {
    // Récupérer les 10 premières photos via l'API Flickr
    const photos = await photoModel.getFlickrPhotos(tags, 'all');
    const first10Photos = photos.slice(0, 5);

    // Créer un fichier ZIP dans un buffer
    const archive = archiver('zip', { zlib: { level: 9 } });
    const zipFilename = `images-${Date.now()}.zip`; // Nom aléatoire basé sur le timestamp
    const file = storage.bucket('dmii2024bucket').file(zipFilename);
    const stream = file.createWriteStream({
      metadata: {
        contentType: 'application/zip',
        cacheControl: 'private',
      },
      resumable: false,
    });

    // Pipeline de zippage
    archive.pipe(stream);

    // Télécharger et ajouter les photos au ZIP avec gestion des réessais et du délai
    for (const [index, photo] of first10Photos.entries()) {
      try {
        console.log(`Téléchargement de la photo ${index + 1}: ${photo.media.m}`);
        const imageBuffer = await downloadImageWithRetry(photo.media.m);
        archive.append(imageBuffer, { name: `photo-${index + 1}.jpg` });

        // Ajouter un délai d'une seconde entre chaque téléchargement pour éviter la limite de taux
        await delay(1000);  // Délai de 1 seconde
      } catch (error) {
        console.error(`Erreur lors du téléchargement de la photo ${index + 1}:`, error);
        throw error;
      }
    }

    // Finaliser l'archive ZIP
    await archive.finalize();

    return new Promise((resolve, reject) => {
      stream.on('error', (err) => {
        reject(err);
      });
      stream.on('finish', () => {
        resolve(zipFilename);
      });
    });
  } catch (error) {
    console.error('Erreur lors de la création ou du téléchargement des images:', error);
    throw error;
  }
}

// Générer une URL signée pour le fichier ZIP dans Google Cloud Storage
async function generateSignedUrl(filename) {
  const options = {
    action: 'read',
    expires: moment().add(2, 'days').unix() * 1000, // Expire dans 2 jours
  };

  // Générer l'URL signée
  const [signedUrl] = await storage
    .bucket('dmii2024bucket')
    .file(filename)
    .getSignedUrl(options);

  return signedUrl;
}

// Fonction pour écouter les messages de Pub/Sub
async function listenForMessages(subscriptionName = 'dmii2-5', timeout = 60) {
  const pubSubClient = new PubSub();
  const subscription = pubSubClient.subscription(subscriptionName);

  // Gestionnaire de messages
  const messageHandler = async (message) => {
    console.log(`Message reçu: ${message.id}`);
    console.log(`Données: ${message.data.toString()}`);
    const tags = JSON.parse(message.data).tags;

    try {
      // Zipper et uploader les images
      const zipFilename = await zipAndUpload(tags);

      // Générer une URL signée pour le fichier ZIP
      const fileUrl = await generateSignedUrl(zipFilename);

      // Mettre à jour le statut du job
      jobsStatus[message.id] = { status: 'success', fileUrl };
      console.log(`Job terminé avec succès. URL du fichier: ${fileUrl}`);

      // Acknowledge le message
      message.ack();
    } catch (error) {
      // En cas d'erreur, stocker l'état du job comme échoué
      jobsStatus[message.id] = { status: 'failed', error: error.message };
      console.error(`Erreur lors du traitement du job: ${error.message}`);

      // Acknowledge tout de même pour ne pas bloquer la queue
      message.ack();
    }
  };

  // Écouter les messages
  subscription.on('message', messageHandler);

  // Arrêter l'écoute après un délai (optionnel)
  setTimeout(() => {
    subscription.removeListener('message', messageHandler);
    console.log(`${timeout} secondes écoulées, arrêt de l'écoute.`);
  }, timeout * 1000);
}

// Appeler la fonction pour écouter les messages
listenForMessages();

module.exports = {
  jobsStatus, // Exporter le statut des jobs si vous voulez y accéder ailleurs
};
