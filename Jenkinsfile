pipeline {
  options {
    buildDiscarder(logRotator(numToKeepStr: '10'))
    disableConcurrentBuilds()
  }
  agent any
  environment {
    IMAGE_NAME      = "nginx-proxy-manager"
    TEMP_IMAGE_NAME = "nginx-proxy-manager-build_${BUILD_NUMBER}"
    TAG_VERSION     = getPackageVersion()
  }
  stages {
    stage('Prepare') {
      steps {
        sh 'docker pull jc21/$IMAGE_NAME-base'
        sh 'docker pull jc21/node'
        sh 'docker pull $DOCKER_CI_TOOLS'
      }
    }
    stage('Build') {
      steps {
        sh 'docker run --rm -v $(pwd):/srv/app -w /srv/app jc21/node yarn --registry=$NPM_REGISTRY install'
        sh 'docker run --rm -v $(pwd):/srv/app -w /srv/app jc21/node npm run-script build'
        sh 'rm -rf node_modules'
        sh 'docker run --rm -v $(pwd):/srv/app -w /srv/app jc21/node yarn --registry=$NPM_REGISTRY install --prod'
        sh 'docker run --rm -v $(pwd):/data $DOCKER_CI_TOOLS node-prune'
        sh 'docker build --squash --compress -t $TEMP_IMAGE_NAME .'
      }
    }
    stage('Publish Private') {
      steps {
        sh 'docker tag $TEMP_IMAGE_NAME ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:$TAG_VERSION'
        sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:$TAG_VERSION'
      }
    }
    stage('Publish Public') {
      when {
        branch 'master'
      }
      steps {
        sh 'docker tag $TEMP_IMAGE_NAME ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:latest'
        sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:latest'
        sh 'docker tag $TEMP_IMAGE_NAME docker.io/jc21/$IMAGE_NAME:latest'
        sh 'docker tag $TEMP_IMAGE_NAME docker.io/jc21/$IMAGE_NAME:$TAG_VERSION'

        withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
          sh "docker login -u '${duser}' -p '${dpass}'"
          sh 'docker push docker.io/jc21/$IMAGE_NAME:latest'
          sh 'docker push docker.io/jc21/$IMAGE_NAME:$TAG_VERSION'
        }
      }
    }
    stage('Publish Beta') {
      when {
        branch 'v2-rewrite'
      }
      steps {
        sh 'docker tag $TEMP_IMAGE_NAME ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:preview'
        sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:preview'
        sh 'docker tag $TEMP_IMAGE_NAME docker.io/jc21/$IMAGE_NAME:preview'

        withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
          sh "docker login -u '${duser}' -p '${dpass}'"
          sh 'docker push docker.io/jc21/$IMAGE_NAME:preview'
        }
      }
    }
  }
  triggers {
    bitbucketPush()
  }
  post {
    success {
      juxtapose event: 'success'
      sh 'figlet "SUCCESS"'
    }
    failure {
      juxtapose event: 'failure'
      sh 'figlet "FAILURE"'
    }
    always {
      sh 'docker rmi  $TEMP_IMAGE_NAME'
    }
  }
}

def getPackageVersion() {
  ver = sh(script: 'docker run --rm -v $(pwd):/data $DOCKER_CI_TOOLS bash -c "cat /data/package.json|jq -r \'.version\'"', returnStdout: true)
  return ver.trim()
}
