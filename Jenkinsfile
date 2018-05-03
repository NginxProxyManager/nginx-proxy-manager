pipeline {
  options {
    buildDiscarder(logRotator(artifactDaysToKeepStr: '', artifactNumToKeepStr: '', daysToKeepStr: '', numToKeepStr: '10'))
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
          sh '''docker pull jc21/nginx-proxy-manager-base
docker pull ${DOCKER_CI_TOOLS}'''

          sh '''CWD=`pwd`
docker run --rm \\
  -v $CWD/manager:/srv/manager \\
  -w /srv/manager \\
  jc21/nginx-proxy-manager-base \\
  npm --registry=$NPM_REGISTRY install
exit $?'''

          sh '''CWD=`pwd`
docker run --rm -v $CWD/manager:/srv/manager -w /srv/manager jc21/nginx-proxy-manager-base gulp build
exit $?'''

          sh '''CWD=`pwd`
docker run --rm -e NODE_ENV=production -v $CWD/manager:/srv/manager -w /srv/manager jc21/nginx-proxy-manager-base npm prune --production
exit $?'''

          sh '''docker run --rm \\
-v $(pwd)/manager:/data \\
${DOCKER_CI_TOOLS} \\
node-prune'''
      }
    }
    stage('Build') {
      steps {
        sh 'docker build -t $TEMP_IMAGE_NAME .'
      }
    }
    stage('Publish') {
      when {
        branch 'master'
      }
      steps {
        sh 'docker tag $TEMP_IMAGE_NAME ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:latest'
        sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:latest'
        sh 'docker tag $TEMP_IMAGE_NAME ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:$TAG_VERSION'
        sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:$TAG_VERSION'
        sh 'docker tag $TEMP_IMAGE_NAME docker-io/jc21/$IMAGE_NAME:latest'
        sh 'docker tag $TEMP_IMAGE_NAME docker-io/jc21/$IMAGE_NAME:$TAG_VERSION'

        withDockerRegistry([credentialsId: 'jc21-dockerhub', url: '']) {
          sh 'docker push docker-io/jc21/$IMAGE_NAME:latest'
          sh 'docker push docker-io/jc21/$IMAGE_NAME:$TAG_VERSION'
        }

        sh 'docker rmi  $TEMP_IMAGE_NAME'
      }
    }
  }
  triggers {
    bitbucketPush()
  }
  post {
    success {
      slackSend color: "#72c900", message: "SUCCESS: <${BUILD_URL}|${JOB_NAME}> build #${BUILD_NUMBER} - Duration: ${currentBuild.durationString}"
    }
    failure {
      slackSend color: "#d61111", message: "FAILED: <${BUILD_URL}|${JOB_NAME}> build #${BUILD_NUMBER} - Duration: ${currentBuild.durationString}"
    }
  }
}

def getPackageVersion() {
  ver = sh(script: 'docker run --rm -v $(pwd)/manager:/data $DOCKER_CI_TOOLS bash -c "cat /data/package.json|jq -r \'.version\'"', returnStdout: true)
  return ver.trim()
}
