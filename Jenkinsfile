// for arm building: https://resin.io/blog/building-arm-containers-on-any-x86-machine-even-dockerhub/

pipeline {
  options {
    buildDiscarder(logRotator(numToKeepStr: '10'))
    disableConcurrentBuilds()
  }
  agent any
  environment {
    IMAGE_NAME          = "nginx-proxy-manager"
    TEMP_IMAGE_NAME     = "nginx-proxy-manager-build_${BUILD_NUMBER}"
    TEMP_IMAGE_NAME_ARM = "nginx-proxy-manager-arm-build_${BUILD_NUMBER}"
    TAG_VERSION         = getPackageVersion()
  }
  stages {
    stage('Prepare') {
      steps {
        sh 'docker pull $DOCKER_CI_TOOLS'
      }
    }
    stage('Build x86_64') {
      steps {
        ansiColor('xterm') {
          sh 'docker run --rm -v $(pwd):/srv/app -w /srv/app jc21/node:latest yarn --registry=$NPM_REGISTRY install'
          sh 'docker run --rm -v $(pwd):/srv/app -w /srv/app jc21/node:latest npm run-script build'
          sh 'rm -rf node_modules'
          sh 'docker run --rm -v $(pwd):/srv/app -w /srv/app jc21/node yarn --registry=$NPM_REGISTRY install --prod'
          sh 'docker run --rm -v $(pwd):/data $DOCKER_CI_TOOLS node-prune'
          sh 'docker build --pull --no-cache --squash --compress -t $TEMP_IMAGE_NAME .'
        }
      }
    }
    stage('Build armhf') {
      steps {
        ansiColor('xterm') {
          sh 'docker run --rm -v $(pwd):/srv/app -w /srv/app jc21/node:armhf yarn --registry=$NPM_REGISTRY install'
          sh 'docker run --rm -v $(pwd):/srv/app -w /srv/app jc21/node:armhf npm run-script build'
          sh 'rm -rf node_modules'
          sh 'docker run --rm -v $(pwd):/srv/app -w /srv/app jc21/node:armhf yarn --registry=$NPM_REGISTRY install --prod'
          sh 'docker run --rm -v $(pwd):/data $DOCKER_CI_TOOLS node-prune'
          sh 'docker build --pull --no-cache --squash --compress -t $TEMP_IMAGE_NAME_ARM -f Dockerfile.armhf .'
        }
      }
    }
    stage('Publish Private') {
      steps {
        sh 'docker tag $TEMP_IMAGE_NAME ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:$TAG_VERSION'
        sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:$TAG_VERSION'

        sh 'docker tag $TEMP_IMAGE_NAME_ARM ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:$TAG_VERSION-armhf'
        sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:$TAG_VERSION-armhf'
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

        sh 'docker tag $TEMP_IMAGE_NAME_ARM docker.io/jc21/$IMAGE_NAME:latest-armhf'
        sh 'docker tag $TEMP_IMAGE_NAME_ARM docker.io/jc21/$IMAGE_NAME:$TAG_VERSION-armhf'

        withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
          sh "docker login -u '${duser}' -p '${dpass}'"
          sh 'docker push docker.io/jc21/$IMAGE_NAME:latest'
          sh 'docker push docker.io/jc21/$IMAGE_NAME:$TAG_VERSION'

          sh 'docker push docker.io/jc21/$IMAGE_NAME:latest-armhf'
          sh 'docker push docker.io/jc21/$IMAGE_NAME:$TAG_VERSION-armhf'
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
        sh 'docker tag $TEMP_IMAGE_NAME_ARM docker.io/jc21/$IMAGE_NAME:preview-armhf'

        withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
          sh "docker login -u '${duser}' -p '${dpass}'"
          sh 'docker push docker.io/jc21/$IMAGE_NAME:preview'
          sh 'docker push docker.io/jc21/$IMAGE_NAME:preview-armhf'
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
      sh 'docker rmi $TEMP_IMAGE_NAME'
      sh 'docker rmi $TEMP_IMAGE_NAME_ARM'
    }
  }
}

def getPackageVersion() {
  ver = sh(script: 'docker run --rm -v $(pwd):/data $DOCKER_CI_TOOLS bash -c "cat /data/package.json|jq -r \'.version\'"', returnStdout: true)
  return ver.trim()
}
