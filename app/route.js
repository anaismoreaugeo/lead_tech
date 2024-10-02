const formValidator = require('./form_validator');
const photoModel = require('./photo_model');
const { publishTagsToPubSub } = require('./pubsub');


function route(app) {
  app.get('/', (req, res) => {
    const tags = req.query.tags;
    const tagmode = req.query.tagmode;

    const ejsLocalVariables = {
      tagsParameter: tags || '',
      tagmodeParameter: tagmode || '',
      photos: [],
      searchResults: false,
      invalidParameters: false
    };

    // if no input params are passed in then render the view with out querying the api
    if (!tags && !tagmode) {
      return res.render('index', ejsLocalVariables);
    }

    // validate query parameters
    if (!formValidator.hasValidFlickrAPIParams(tags, tagmode)) {
      ejsLocalVariables.invalidParameters = true;
      return res.render('index', ejsLocalVariables);
    }

    // get photos from flickr public feed api
    return photoModel
      .getFlickrPhotos(tags, tagmode)
      .then(photos => {
        ejsLocalVariables.photos = photos;
        ejsLocalVariables.searchResults = true;
        return res.render('index', ejsLocalVariables);
      })
      .catch(error => {
        return res.status(500).send({ error });
      });
  });

  app.post('/zip', async (req, res) => {
    const { tags } = req.body;
  
    if (!tags) {
      return res.status(400).json({ error: 'Aucun tag fourni' });
    }
  
    try {
      // Publier les tags dans Google Pub/Sub
      const messageId = await publishTagsToPubSub(tags);
      console.log(`Tags publiés dans Pub/Sub avec le message ID: ${messageId}`);
  
      // Procéder à la création du ZIP (code existant ici)
  
    } catch (error) {
      console.error('Erreur lors de la publication dans Pub/Sub:', error);
      res.status(500).json({ error: 'Erreur lors de la publication des tags dans Pub/Sub' });
    }
  });
  
  /*app.post('/zip', async (req, res) => {
    const { tags, tagmode } = req.body;
  
    if (!tags || !tagmode) {
      return res.status(400).json({ error: 'Les tags ou le mode de tag sont manquants' });
    }
  
    try {
      // Récupérer les photos via le modèle
      const photos = await photoModel.getFlickrPhotos(tags, tagmode);
      
      // Ajouter un log pour voir les photos récupérées
      console.log('Photos récupérées:', photos);
  
      const first10Photos = photos.slice(0, 10);
  
      if (first10Photos.length === 0) {
        return res.status(400).json({ error: 'Aucune photo trouvée pour ces tags' });
      }
  
      // Création d'un fichier ZIP
      const archive = archiver('zip', { zlib: { level: 9 } });
      res.attachment('photos.zip'); // Nom du fichier ZIP
  
      archive.on('error', (err) => {
        console.error('Erreur lors de la création du ZIP:', err);
        return res.status(500).send('Échec de la création du fichier ZIP');
      });
  
      archive.pipe(res); // Envoyer le fichier ZIP au client
  
      // Télécharger et ajouter chaque photo dans le ZIP
      for (const [index, photo] of first10Photos.entries()) {
        console.log(`Téléchargement de la photo ${index + 1}: ${photo.media.m}`);
        const imageResponse = await axios.get(photo.media.m, { responseType: 'arraybuffer' });
        const imageBuffer = imageResponse.data;
        archive.append(imageBuffer, { name: `photo-${index + 1}.jpg` });
      }
  
      archive.finalize(); // Terminer la création du fichier ZIP
    } catch (error) {
      console.error('Erreur lors de la récupération des photos ou de la création du ZIP:', error);
      return res.status(500).json({ error: 'Erreur lors du téléchargement des photos ou de la création du fichier ZIP' });
    }
  });
  
/*
  app.post('/publish-tags', async (req, res) => {
    const { tags } = req.body;

    if (!tags) {
      return res.status(400).json({ error: 'Aucun tag fourni' });
    }

    try {
      // Publier les tags dans Google Pub/Sub
      const messageId = await publishTagsToPubSub(tags);
      res.status(200).json({ message: `Tags publiés avec succès. Message ID: ${messageId}` });
    } catch (error) {
      console.error('Erreur lors de la publication dans Pub/Sub:', error);
      res.status(500).json({ error: 'Erreur lors de la publication des tags dans Pub/Sub' });
    }
  });
  /*
  app.post('/zip', (req, res) => {
    const { tags } = req.body;

    if (!tags) {
      return res.status(400).json({ error: 'Aucun tag fourni' });
    }

    // Séparer les tags par des virgules
    const tagsArray = tags.split(',');

    // Création d'un fichier ZIP
    const archive = archiver('zip', { zlib: { level: 9 } }); // Compression maximale
    res.attachment('tags.zip'); // Nom du fichier ZIP

    archive.on('error', (err) => {
      console.error('Erreur lors de la création du ZIP:', err);
      return res.status(500).send('Échec de la création du fichier ZIP');
    });

    archive.pipe(res); // Envoyer le ZIP directement dans la réponse

    // Pour chaque tag, ajouter un fichier texte dans le ZIP
    tagsArray.forEach((tag, index) => {
      archive.append(`Contenu pour le tag: ${tag}`, { name: `tag-${index + 1}.txt` });
    });

    archive.finalize(); // Terminer la création du fichier ZIP
  });*/
}

module.exports = route;
