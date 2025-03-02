#!/bin/bash
# Check if the --env flag is provided
if [[ "$1" != "--env" ]]; then
    echo "Usage: $0 --env [dev|prod]"
    exit 1
fi

# Get the environment from the command line argument
ENV="$2"

# Validate the environment
if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
    echo "Invalid environment. Use 'dev' or 'prod'."
    exit 1
fi

# Set the instance name based on the environment
if [[ "$ENV" == "dev" ]]; then
    INSTANCE_NAME="openfrontio-dev-instance"
    TAG="dev"
    GAME_ENV="preprod"
    echo "[DEV] Deploying to openfront.dev"
else
    INSTANCE_NAME="openfrontio-instance"
    TAG="latest"
    GAME_ENV="prod"
    echo "[PROD] Deploying to openfront.io"
fi

# Ensure you're authenticated with Google Cloud
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build the new Docker image with platform specification and GAME_ENV build argument
docker build --platform linux/amd64 --build-arg GAME_ENV=$GAME_ENV -t openfrontio .

# Tag the new image
docker tag openfrontio us-central1-docker.pkg.dev/openfrontio/openfrontio/game-server:$TAG

# Push the new image to Google Container Registry
docker push us-central1-docker.pkg.dev/openfrontio/openfrontio/game-server:$TAG

# Prune Docker system on the instance
gcloud compute ssh $INSTANCE_NAME --zone us-central1-a --command 'docker system prune -f -a'
gcloud compute ssh $INSTANCE_NAME --zone us-central1-a --command 'docker kill $(docker ps -q)'
gcloud compute ssh $INSTANCE_NAME --zone us-central1-a --command 'docker rmi $(docker images -q) -f'

# Update the GCE instance with the new container image
gcloud compute instances update-container $INSTANCE_NAME \
  --container-image us-central1-docker.pkg.dev/openfrontio/openfrontio/game-server:$TAG \
  --zone=us-central1-a

echo "Deployment to $ENV environment complete. New version should be live soon on $INSTANCE_NAME."